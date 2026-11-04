"use server";

/**
 * Mark a pending manual payment as received.
 *
 * It runs the same completion path as a gateway payment, so the subscription it
 * creates is indistinguishable from a paid one. The idempotency guard lives in
 * `completeTransaction`: confirming the same reference twice must not extend the
 * period twice.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parseConfirmResult, type ConfirmResult } from "@/lib/admin/domain/transactions";
import type { ConfirmTransactionInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

const CONFIRM_GET = { reference: 1, status: 1, alreadyProcessed: 1 } as const;

export async function adminConfirmTransaction(
  input: ConfirmTransactionInput,
): Promise<ActResult<ConfirmResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const note = input.note?.trim();

  const result = await callAct("billingTransaction", "adminConfirmTransaction", {
    set: {
      reference: input.reference.trim(),
      ...(note ? { note } : {}),
    },
    get: CONFIRM_GET,
  });

  if (!result.success) {
    return result;
  }

  const confirmation = parseConfirmResult(result.body);
  if (!confirmation) {
    return fail(
      "server",
      "adminConfirmTransaction returned a payload that is not a confirmation.",
    );
  }

  return ok(confirmation);
}
