import { type ActFn, ObjectId } from "lesan";
import { billingTransaction } from "../../../../mod.ts";
import { pickByGet, throwError } from "@lib";
import { revokeSubscription } from "../../../billing/lifecycle.ts";
import { recordAudit } from "../../audit.ts";

/**
 * Records a refund and ends the access it bought.
 *
 * Both halves are needed. Marking the transaction refunded without revoking
 * leaves a listener on Pro for free; revoking without marking the refund leaves
 * the ledger claiming money we returned. They are written in that order —
 * ledger first, access second — because a failure between them leaves a refund
 * the operator can see and finish, rather than a silent loss of access with no
 * record of why.
 *
 * The transaction row is never deleted. It is the receipt.
 */
export const adminRefundTransactionFn: ActFn = async (body) => {
  const { set } = body.details;

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
  if (transaction!.status !== "paid") {
    throwError("Only a paid transaction can be refunded");
  }

  const now = Date.now();

  await billingTransaction.findOneAndUpdate({
    filter: { _id: transaction!._id },
    update: {
      $set: {
        status: "refunded",
        refundedAt: now,
        updatedAt: new Date(now),
        ...(set.reason !== undefined ? { note: set.reason } : {}),
      },
    },
    projection: { _id: 1 },
  });

  await revokeSubscription(new ObjectId(String(transaction!.userId)), {
    immediate: true,
  });

  await recordAudit({
    action: "transaction.refund",
    targetType: "transaction",
    targetId: set.reference,
    summary: `Refunded ${transaction!.amountCents / 100} ${
      transaction!.currency ?? "USD"
    } to ${transaction!.userEmail ?? transaction!.userId}`,
    metadata: {
      planCode: transaction!.planCode,
      reason: set.reason ?? null,
      userId: transaction!.userId,
    },
  });

  return pickByGet({
    refunded: true,
    reference: set.reference,
    status: "refunded",
    accessRevoked: true,
  }, body.details.get);
};
