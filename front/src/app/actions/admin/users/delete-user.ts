"use server";

/**
 * Delete an account and everything that belongs to it.
 *
 * The typed email is not a nicety: the backend refuses unless it matches the
 * account, and the form makes an operator type it for the same reason. Payments
 * survive by design — the ledger is a financial record, not a child row.
 */

import { requireAdmin } from "@/lib/admin/guard";
import type { DeleteUserInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { asNumber, asRecord } from "@/lib/parse";
import { ok, type ActResult } from "@/lib/result";

export type DeleteUserResult = { deleted: boolean; purged: Record<string, number> };

export async function adminDeleteUser(
  input: DeleteUserInput,
): Promise<ActResult<DeleteUserResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("user", "adminDeleteUser", {
    set: {
      userId: input.userId,
      confirmEmail: input.confirmEmail,
    },
    get: { deleted: 1, purged: 1 },
  });

  if (!result.success) {
    return result;
  }

  const body = asRecord(result.body);
  const purgedRaw = asRecord(body?.purged);
  const purged: Record<string, number> = {};

  for (const [key, value] of Object.entries(purgedRaw ?? {})) {
    const count = asNumber(value);
    if (count !== null) {
      purged[key] = count;
    }
  }

  return ok({ deleted: body?.deleted === true, purged });
}
