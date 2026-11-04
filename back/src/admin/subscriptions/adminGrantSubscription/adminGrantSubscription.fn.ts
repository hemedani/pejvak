import { type ActFn, ObjectId } from "lesan";
import { plan, user } from "../../../../mod.ts";
import { currentUser, pickByGet, throwError } from "@lib";
import {
  type AdminGrant,
  completeTransaction,
  createPendingTransaction,
} from "../../../billing/lifecycle.ts";
import { resolveEntitlement } from "../../../entitlements/entitlement.ts";
import { recordAudit } from "../../audit.ts";

/**
 * Gives an account a plan without money changing hands.
 *
 * It goes through the same transaction table and the same completion path as a
 * real purchase, with `provider: "manual"` and an amount of the plan's price.
 * That is deliberate: a comped month and a paid month should leave the same
 * audit trail and the same kind of receipt, and one code path means one set of
 * bugs. The note is what distinguishes them.
 *
 * Granting extends an existing subscription of the same plan rather than
 * replacing it, so support adding a week does not erase the days already paid.
 */
export const adminGrantSubscriptionFn: ActFn = async (body) => {
  const { set } = body.details;
  const actor = currentUser();
  const userId = new ObjectId(set.userId);

  const mode = set.mode;
  if (mode === "usage") {
    if (!set.caps || Object.values(set.caps).every((v) => v === undefined)) {
      throwError("A usage grant needs at least one cap");
    }
    if (set.duration !== undefined) {
      throwError("A usage grant does not take a duration");
    }
    for (
      const [name, value] of Object.entries(set.caps ?? {}) as [
        string,
        number | undefined,
      ][]
    ) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0) {
        throwError(
          `caps.${name} must be zero or a positive whole number`,
        );
      }
    }
  } else if (mode === "duration") {
    if (!set.duration) throwError("A duration grant needs a duration");
    if (
      !Number.isInteger(set.duration.value) || set.duration.value <= 0
    ) {
      throwError("duration.value must be a positive whole number");
    }
    if (set.caps !== undefined) {
      throwError("A duration grant does not take caps");
    }
  } else if (mode === "forever") {
    if (set.duration !== undefined || set.caps !== undefined) {
      throwError("A forever grant does not take a duration or caps");
    }
  } else if (set.duration !== undefined || set.caps !== undefined) {
    throwError("Choose a grant mode for a duration or usage grant");
  }

  const grant: AdminGrant | undefined = mode === undefined ? undefined : {
    mode,
    ...(set.duration !== undefined ? { duration: set.duration } : {}),
    ...(set.caps !== undefined ? { usageCaps: set.caps } : {}),
  };

  const target = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1, email: 1 },
  });
  if (!target) throwError("User not found");

  const foundPlan = await plan.findOne({
    filters: { code: set.planCode },
    projection: {
      code: 1,
      title: 1,
      priceCents: 1,
      currency: 1,
      billingInterval: 1,
    },
  });
  if (!foundPlan) throwError("That plan does not exist");

  const interval = set.interval ?? foundPlan!.billingInterval ?? "month";

  const { reference } = await createPendingTransaction({
    userId,
    userEmail: target!.email,
    planCode: foundPlan!.code,
    planTitle: foundPlan!.title,
    amountCents: foundPlan!.priceCents ?? 0,
    currency: foundPlan!.currency ?? "USD",
    interval,
    provider: "manual",
  });

  const completion = await completeTransaction(reference, {
    note: set.note ?? `Granted by ${actor.email ?? "an admin"}`,
    ...(grant !== undefined ? { grant, metadata: { grant } } : {}),
  });

  const entitlement = await resolveEntitlement(userId);
  const activation = completion.activation;
  const grantMode = activation?.grantMode ?? entitlement.grantMode;
  const usageCaps = activation?.usageCaps ?? entitlement.usageCaps;

  await recordAudit({
    action: "subscription.grant",
    targetType: "subscription",
    targetId: String(userId),
    summary: `Granted ${foundPlan!.title} to ${target!.email}`,
    metadata: {
      planCode: foundPlan!.code,
      interval,
      mode: grantMode ?? null,
      duration: grant?.duration ?? null,
      caps: grant?.usageCaps ?? null,
      reference,
      note: set.note ?? null,
      alreadyProcessed: completion.alreadyProcessed,
    },
  });

  return pickByGet({
    reference,
    planCode: activation?.planCode ?? entitlement.planCode,
    planTitle: activation?.planTitle ?? entitlement.planTitle,
    status: entitlement.subscriptionStatus,
    ...(grantMode !== undefined ? { grantMode } : {}),
    ...(usageCaps !== undefined ? { usageCaps } : {}),
    ...(entitlement.currentPeriodEnd !== undefined
      ? { currentPeriodEnd: entitlement.currentPeriodEnd }
      : {}),
    ...(completion.activation !== undefined
      ? {
        periodStart: completion.activation.periodStart,
        ...(completion.activation.periodEnd !== undefined
          ? { periodEnd: completion.activation.periodEnd }
          : {}),
      }
      : {}),
  }, body.details.get);
};
