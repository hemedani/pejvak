import { type ActFn } from "lesan";
import { billingTransaction } from "../../../../mod.ts";
import { currentUser, pickByGet, throwError } from "@lib";
import { completeTransaction } from "../../../billing/lifecycle.ts";
import { recordAudit } from "../../audit.ts";

/**
 * Marks a pending payment as received, for the manual provider.
 *
 * It runs the same completion path as a card payment, so the subscription it
 * creates is indistinguishable from one a gateway confirmed — which is the
 * point: the entitlement layer never needs to know how the money arrived.
 *
 * The transaction is looked up first only to write a useful audit line; the
 * idempotency guarantee lives in `completeTransaction`, which refuses to extend
 * a period twice for the same reference.
 */
export const adminConfirmTransactionFn: ActFn = async (body) => {
  const { set } = body.details;
  const actor = currentUser();

  const transaction = await billingTransaction.findOne({
    filters: { reference: set.reference },
    projection: {
      reference: 1,
      userId: 1,
      userEmail: 1,
      planCode: 1,
      amountCents: 1,
      currency: 1,
      status: 1,
    },
  });

  if (!transaction) throwError("Transaction not found");
  if (transaction!.status === "refunded") {
    throwError("This payment was refunded");
  }

  const completion = await completeTransaction(set.reference, {
    ...(set.note !== undefined ? { note: set.note } : {}),
  });

  await recordAudit({
    action: "transaction.confirm",
    targetType: "transaction",
    targetId: set.reference,
    summary: `Confirmed ${transaction!.amountCents / 100} ${
      transaction!.currency ?? "USD"
    } for ${transaction!.userEmail ?? transaction!.userId}`,
    metadata: {
      planCode: transaction!.planCode,
      note: set.note ?? null,
      alreadyProcessed: completion.alreadyProcessed,
      actor: actor.email ?? null,
    },
  });

  return pickByGet({
    reference: set.reference,
    status: completion.status,
    alreadyProcessed: completion.alreadyProcessed,
    ...(completion.activation !== undefined
      ? {
        planCode: completion.activation.planCode,
        periodStart: completion.activation.periodStart,
        ...(completion.activation.periodEnd !== undefined
          ? { periodEnd: completion.activation.periodEnd }
          : {}),
      }
      : {}),
  }, body.details.get);
};
