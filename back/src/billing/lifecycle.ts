import { ObjectId } from "lesan";
import { billingTransaction, plan, subscription } from "../../mod.ts";
import { throwError } from "@lib";

export type BillingInterval = "month" | "year" | "lifetime";

export type GrantMode = "forever" | "duration" | "usage";

export type DurationUnit = "day" | "week" | "month" | "year";

export type GrantDuration = { value: number; unit: DurationUnit };

export type UsageCaps = {
  historyEntries?: number;
  playlists?: number;
  maxTracks?: number;
};

export type AdminGrant = {
  mode: GrantMode;
  duration?: GrantDuration;
  usageCaps?: UsageCaps;
};

export const intervalOf = (value?: string): BillingInterval =>
  value === "year" || value === "lifetime" ? value : "month";

/**
 * When a period that starts at `from` ends.
 *
 * Calendar arithmetic, not `+30 days`: a monthly plan bought on the 31st must
 * renew on the last day of the next month, and a yearly one on the same date a
 * year later. `lifetime` returns `undefined` — there is nothing to expire, and
 * writing a far-future date would only pretend otherwise.
 */
export const periodEndFor = (
  interval: BillingInterval,
  from: number,
): number | undefined => {
  if (interval === "lifetime") return undefined;

  const date = new Date(from);
  if (interval === "year") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.getTime();
};

/**
 * When an explicit day/week/month/year duration ends.
 *
 * Weeks are seven UTC days. Months and years use calendar arithmetic so "one
 * month from 31 January" lands on the last day of February, the same rule the
 * paid intervals follow.
 */
export const periodEndForDuration = (
  duration: GrantDuration,
  from: number,
): number => {
  const date = new Date(from);

  switch (duration.unit) {
    case "day":
      date.setUTCDate(date.getUTCDate() + duration.value);
      break;
    case "week":
      date.setUTCDate(date.getUTCDate() + duration.value * 7);
      break;
    case "month":
      date.setUTCMonth(date.getUTCMonth() + duration.value);
      break;
    case "year":
      date.setUTCFullYear(date.getUTCFullYear() + duration.value);
      break;
  }

  return date.getTime();
};

export const newReference = () => `txn_${crypto.randomUUID()}`;

export type ActivationResult = {
  subscriptionId: string;
  planCode: string;
  planTitle: string;
  periodStart: number;
  periodEnd?: number;
  grantMode?: GrantMode;
  usageCaps?: UsageCaps;
};

/**
 * Grants a plan, extending rather than replacing.
 *
 * A renewal of the same plan starts where the paid time ends, so buying twice
 * in one day does not throw away the first period. A change of plan starts now:
 * the listener is buying a different thing, and the old remainder cannot be
 * converted into it.
 *
 * There is exactly one row per listener in practice. It is updated in place
 * instead of inserting a new subscription per purchase, so "what plan is this
 * account on?" is one lookup and cannot return two answers.
 */
export const activateSubscription = async ({
  userId,
  planCode,
  interval,
  provider,
  providerRef,
  note,
  grant,
}: {
  userId: ObjectId;
  planCode: string;
  interval?: string;
  provider?: string;
  providerRef?: string;
  note?: string;
  grant?: AdminGrant;
}): Promise<ActivationResult> => {
  const foundPlan = await plan.findOne({
    filters: { code: planCode },
    projection: { code: 1, title: 1, billingInterval: 1, isActive: 1 },
  });

  if (!foundPlan) throwError("That plan does not exist");
  if (foundPlan!.isActive === false) {
    throwError("That plan is no longer available");
  }

  const effectiveInterval = intervalOf(interval ?? foundPlan!.billingInterval);
  const grantMode: GrantMode = grant?.mode ??
    (effectiveInterval === "lifetime" ? "forever" : "duration");
  const now = Date.now();

  const existing = await subscription.findOne({
    filters: { "user._id": userId },
    options: { sort: { createdAt: -1 } },
    projection: {
      _id: 1,
      planCode: 1,
      status: 1,
      startedAt: 1,
      currentPeriodEnd: 1,
    },
  });

  // Only a timed grant extends. A usage grant measures stock counts, so a
  // second grant sets a new ceiling rather than starting later; a forever
  // grant has no later to start from.
  const extendable = grantMode === "duration" &&
    existing &&
    existing.planCode === planCode &&
    existing.status !== "canceled" &&
    existing.status !== "expired" &&
    typeof existing.currentPeriodEnd === "number" &&
    existing.currentPeriodEnd > now;

  const periodStart = extendable ? existing!.currentPeriodEnd! : now;
  const periodEnd = grantMode !== "duration"
    ? undefined
    : grant?.duration !== undefined
    ? periodEndForDuration(grant.duration, periodStart)
    : periodEndFor(effectiveInterval, periodStart);
  const usageCaps = grantMode === "usage" ? grant?.usageCaps : undefined;
  const startedAt = existing?.startedAt ?? now;

  const fields: Record<string, unknown> = {
    planCode,
    status: "active",
    startedAt,
    currentPeriodStart: periodStart,
    cancelAtPeriodEnd: false,
    grantMode,
    // A comped grant does not renew itself; an operator decides when it ends.
    autoRenew: grant !== undefined ? false : effectiveInterval !== "lifetime",
    provider: provider ?? "manual",
    ...(providerRef !== undefined ? { providerRef } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(usageCaps !== undefined ? { usageCaps } : {}),
    updatedAt: new Date(now),
  };

  if (periodEnd !== undefined) {
    fields.currentPeriodEnd = periodEnd;
  }

  if (existing) {
    await subscription.findOneAndUpdate({
      filter: { _id: existing._id },
      update: {
        $set: fields,
        // A reactivated subscription is no longer scheduled to end, and a
        // non-usage grant must not keep stale caps from an earlier one.
        $unset: {
          canceledAt: "",
          ...(periodEnd === undefined ? { currentPeriodEnd: "" } : {}),
          ...(usageCaps === undefined ? { usageCaps: "" } : {}),
        },
      } as never,
      projection: { _id: 1 },
    });

    return {
      subscriptionId: String(existing._id),
      planCode,
      planTitle: foundPlan!.title,
      periodStart,
      ...(periodEnd !== undefined ? { periodEnd } : {}),
      grantMode,
      ...(usageCaps !== undefined ? { usageCaps } : {}),
    };
  }

  const created = await subscription.insertOne({
    doc: {
      ...fields,
      createdAt: new Date(now),
    } as never,
    relations: {
      user: { _ids: userId, relatedRelations: { subscriptions: true } },
    } as never,
    projection: { _id: 1 },
  });

  if (!created) throwError("The subscription was not created");

  return {
    subscriptionId: String(created!._id),
    planCode,
    planTitle: foundPlan!.title,
    periodStart,
    ...(periodEnd !== undefined ? { periodEnd } : {}),
    grantMode,
    ...(usageCaps !== undefined ? { usageCaps } : {}),
  };
};

/**
 * Ends a subscription.
 *
 * `immediate` is the admin's revoke (access stops now, used for a refund or an
 * abuse case); the default is the listener's cancel, which only stops renewal
 * and leaves the paid days intact. Both are written as `canceled` rather than
 * deleting the row, because the purchase history is the answer to "why can this
 * person not sync?".
 */
export const revokeSubscription = async (
  userId: ObjectId,
  { immediate }: { immediate: boolean },
): Promise<{ canceled: boolean }> => {
  const existing = await subscription.findOne({
    filters: { "user._id": userId },
    options: { sort: { createdAt: -1 } },
    projection: { _id: 1, status: 1, currentPeriodEnd: 1 },
  });

  if (!existing) return { canceled: false };

  const now = Date.now();

  if (!immediate) {
    await subscription.findOneAndUpdate({
      filter: { _id: existing._id },
      update: {
        $set: {
          cancelAtPeriodEnd: true,
          autoRenew: false,
          updatedAt: new Date(now),
        },
      },
      projection: { _id: 1 },
    });
    return { canceled: true };
  }

  await subscription.findOneAndUpdate({
    filter: { _id: existing._id },
    update: {
      $set: {
        status: "canceled",
        cancelAtPeriodEnd: true,
        autoRenew: false,
        canceledAt: now,
        // Access ends now, so the entitlement check must not honour the old end.
        currentPeriodEnd: now,
        updatedAt: new Date(now),
      },
    },
    projection: { _id: 1 },
  });

  return { canceled: true };
};

export const createPendingTransaction = async ({
  userId,
  userEmail,
  planCode,
  planTitle,
  amountCents,
  currency,
  interval,
  provider,
}: {
  userId: ObjectId;
  userEmail?: string;
  planCode: string;
  planTitle: string;
  amountCents: number;
  currency: string;
  interval: string;
  provider: string;
}): Promise<{ reference: string }> => {
  const reference = newReference();
  const now = new Date();

  await billingTransaction.insertOne({
    doc: {
      reference,
      userId: String(userId),
      ...(userEmail !== undefined ? { userEmail } : {}),
      planCode,
      planTitle,
      amountCents,
      currency,
      billingInterval: interval,
      status: "pending",
      provider,
      createdAt: now,
      updatedAt: now,
    },
    projection: { _id: 1 },
  });

  return { reference };
};

export type CompletionResult = {
  alreadyProcessed: boolean;
  reference: string;
  status: string;
  activation?: ActivationResult;
};

/**
 * Turns a paid reference into an active subscription — exactly once.
 *
 * The claim (`pending` → `paid`) is a conditional update, so two confirmations
 * racing (a double click, a retried callback) cannot both extend the period:
 * the second finds no `pending` document and returns `alreadyProcessed`.
 *
 * If activation then fails, the claim is rolled back to `pending`. A payment
 * that bought nothing must stay retryable; leaving it `paid` would make the
 * listener's money disappear behind an idempotency guard.
 */
export const completeTransaction = async (
  reference: string,
  options: {
    providerRef?: string;
    metadata?: Record<string, unknown>;
    note?: string;
    grant?: AdminGrant;
  } = {},
): Promise<CompletionResult> => {
  const transaction = await billingTransaction.findOne({
    filters: { reference },
    projection: {
      _id: 1,
      reference: 1,
      userId: 1,
      planCode: 1,
      planTitle: 1,
      amountCents: 1,
      currency: 1,
      billingInterval: 1,
      provider: 1,
      providerRef: 1,
      status: 1,
    },
  });

  if (!transaction) throwError("Transaction not found");

  const status = transaction!.status ?? "pending";

  if (status === "paid") {
    return { alreadyProcessed: true, reference, status };
  }
  if (status === "refunded") {
    throwError("This payment was refunded and cannot be completed");
  }
  if (status === "canceled") {
    throwError("This payment was canceled and cannot be completed");
  }

  const now = Date.now();

  try {
    await billingTransaction.findOneAndUpdate({
      filter: { _id: transaction!._id, status: "pending" },
      update: {
        $set: {
          status: "paid",
          paidAt: now,
          updatedAt: new Date(now),
          ...(options.providerRef !== undefined
            ? { providerRef: options.providerRef }
            : {}),
          ...(options.metadata !== undefined
            ? { metadata: JSON.stringify(options.metadata) }
            : {}),
          ...(options.note !== undefined ? { note: options.note } : {}),
        },
      },
      projection: { _id: 1 },
    });
  } catch {
    const current = await billingTransaction.findOne({
      filters: { _id: transaction!._id },
      projection: { status: 1 },
    });

    return {
      alreadyProcessed: current?.status === "paid",
      reference,
      status: (current?.status as string) ?? "unknown",
    };
  }

  let activation: ActivationResult;
  try {
    activation = await activateSubscription({
      userId: new ObjectId(String(transaction!.userId)),
      planCode: transaction!.planCode,
      interval: transaction!.billingInterval,
      provider: transaction!.provider,
      providerRef: options.providerRef ?? transaction!.providerRef,
      grant: options.grant,
    });
  } catch (error) {
    try {
      await billingTransaction.findOneAndUpdate({
        filter: { _id: transaction!._id },
        update: {
          $set: { status: "pending", updatedAt: new Date() },
          $unset: { paidAt: "" },
        } as never,
        projection: { _id: 1 },
      });
    } catch {
      // Nothing more can be done here; the reference stays paid and the
      // failure is visible in the logs of the caller.
    }
    throw error;
  }

  await billingTransaction.findOneAndUpdate({
    filter: { _id: transaction!._id },
    update: {
      $set: {
        periodStart: activation.periodStart,
        ...(activation.periodEnd !== undefined
          ? { periodEnd: activation.periodEnd }
          : {}),
        updatedAt: new Date(),
      },
    },
    projection: { _id: 1 },
  });

  return {
    alreadyProcessed: false,
    reference,
    status: "paid",
    activation,
  };
};
