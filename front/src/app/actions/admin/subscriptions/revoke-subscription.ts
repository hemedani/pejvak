"use server";

/**
 * End a subscription now — the refund and abuse path.
 *
 * The plan row and its history remain: this writes the end to the present, so
 * the next sync sees the free cap, and "why did this person lose Pro?" still has
 * an answer in the panel and the audit feed.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parseRevokeResult, type RevokeResult } from "@/lib/admin/domain/subscriptions";
import type { RevokeSubscriptionInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

const REVOKE_GET = { revoked: 1, planCode: 1, status: 1 } as const;

export async function adminRevokeSubscription(
  input: RevokeSubscriptionInput,
): Promise<ActResult<RevokeResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const reason = input.reason?.trim();

  const result = await callAct("subscription", "adminRevokeSubscription", {
    set: {
      userId: input.userId,
      ...(reason ? { reason } : {}),
    },
    get: REVOKE_GET,
  });

  if (!result.success) {
    return result;
  }

  const revoke = parseRevokeResult(result.body);
  if (!revoke) {
    return fail("server", "adminRevokeSubscription returned a payload that is not a revoke.");
  }

  return ok(revoke);
}
