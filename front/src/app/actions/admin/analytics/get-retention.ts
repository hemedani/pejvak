"use server";

/**
 * Weekly cohort retention.
 *
 * A cohort is the accounts created in one UTC week; week N is how many of them
 * listened in their Nth week. Week 0 is a sanity check, not a metric — it is
 * near 100% by construction.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseRetention,
  RETENTION_GET,
  type AdminRetention,
} from "@/lib/admin/domain/analytics";
import { wholeNumber } from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetRetention(
  cohorts = 6,
  weeks = 6,
): Promise<ActResult<AdminRetention>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("playbackSession", "adminGetRetention", {
    set: {
      cohorts: wholeNumber(cohorts, 6, 1, 12),
      weeks: wholeNumber(weeks, 6, 1, 12),
    },
    get: RETENTION_GET,
  });

  if (!result.success) {
    return result;
  }

  const retention = parseRetention(result.body);
  if (!retention) {
    return fail("server", "adminGetRetention returned a payload that is not a cohort table.");
  }

  return ok(retention);
}
