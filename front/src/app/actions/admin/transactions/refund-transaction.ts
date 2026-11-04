"use server";

/**
 * Record a refund and end the access it bought.
 *
 * Both halves are required. The ledger is marked refunded and the subscription
 * is revoked; leaving either half out makes the panel disagree with the money.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parseRefundResult, type RefundResult } from "@/lib/admin/domain/transactions";
import type { RefundTransactionInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

const REFUND_GET = {
  refunded: 1,
  reference: 1,
  status: 1,
  accessRevoked: 1,
} as const;

export async function adminRefundTransaction(
  input: RefundTransactionInput,
): Promise<ActResult<RefundResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const reason = input.reason?.trim();

  const result = await callAct("billingTransaction", "adminRefundTransaction", {
    set: {
      reference: input.reference.trim(),
      ...(reason ? { reason } : {}),
    },
    get: REFUND_GET,
  });

  if (!result.success) {
    return result;
  }

  const refund = parseRefundResult(result.body);
  if (!refund) {
    return fail("server", "adminRefundTransaction returned a payload that is not a refund.");
  }

  return ok(refund);
}
