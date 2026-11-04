"use server";

/**
 * Give an account a plan without money changing hands.
 *
 * The grant mode decides the shape: `forever` takes neither duration nor caps,
 * `duration` takes both a value and a unit, `usage` takes at least one cap and
 * no duration. The backend enforces those combinations; this action forwards
 * only the fields the chosen mode owns, so an old value left in a form cannot
 * silently travel with a different mode.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parseGrantResult, type GrantResult } from "@/lib/admin/domain/subscriptions";
import type { GrantSubscriptionInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

const GRANT_GET = {
  reference: 1,
  planCode: 1,
  planTitle: 1,
  status: 1,
} as const;

export async function adminGrantSubscription(
  input: GrantSubscriptionInput,
): Promise<ActResult<GrantResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const note = input.note?.trim();

  const result = await callAct("subscription", "adminGrantSubscription", {
    set: {
      userId: input.userId,
      planCode: input.planCode.trim(),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.mode === "duration" && input.duration !== undefined
        ? { duration: input.duration }
        : {}),
      ...(input.mode === "usage" && input.caps !== undefined
        ? { caps: input.caps }
        : {}),
      ...(input.mode === undefined && input.interval !== undefined
        ? { interval: input.interval }
        : {}),
      ...(note ? { note } : {}),
    },
    get: GRANT_GET,
  });

  if (!result.success) {
    return result;
  }

  const grant = parseGrantResult(result.body);
  if (!grant) {
    return fail("server", "adminGrantSubscription returned a payload that is not a grant.");
  }

  return ok(grant);
}
