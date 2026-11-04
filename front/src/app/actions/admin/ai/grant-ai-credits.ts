"use server";

/**
 * Add credits to one listener's month.
 *
 * A bonus pool, never a reduction of `creditsUsed`: the meter must keep saying
 * how much was actually consumed, and a grant is a separate fact. The action
 * trims the note and lets the backend refuse a non-positive amount.
 */

import { requireAdmin } from "@/lib/admin/guard";
import {
  AI_USAGE_GET,
  parseAiCreditGrant,
  type AiCreditGrant,
} from "@/lib/admin/domain/ai";
import type { GrantAiCreditsInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGrantAiCredits(
  input: GrantAiCreditsInput,
): Promise<ActResult<AiCreditGrant>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const note = input.note?.trim();

  const result = await callAct("aiUsage", "adminGrantAiCredits", {
    set: {
      userId: input.userId,
      credits: input.credits,
      ...(input.periodKey === undefined ? {} : { periodKey: input.periodKey }),
      ...(note ? { note } : {}),
    },
    get: AI_USAGE_GET,
  });

  if (!result.success) {
    return result;
  }

  const grant = parseAiCreditGrant(result.body);
  if (!grant) {
    return fail("server", "adminGrantAiCredits returned a payload that is not a grant.");
  }

  return ok(grant);
}
