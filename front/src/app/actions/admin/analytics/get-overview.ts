"use server";

/**
 * The landing numbers.
 *
 * One act, one projection: the page does not derive MRR, active listeners or the
 * quota pressure itself. Those are aggregations over the rows that define them,
 * and recomputing them from a smaller payload would be a second source of truth.
 */

import { requireSupport } from "@/lib/admin/guard";
import { OVERVIEW_GET, parseOverview, type AdminOverview } from "@/lib/admin/domain/analytics";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetOverview(): Promise<ActResult<AdminOverview>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("playbackSession", "adminGetOverview", {
    set: {},
    get: OVERVIEW_GET,
  });

  if (!result.success) {
    return result;
  }

  const overview = parseOverview(result.body);
  if (!overview) {
    return fail("server", "adminGetOverview returned a payload that is not an overview.");
  }

  return ok(overview);
}
