"use server";

/**
 * The plan catalogue.
 *
 * Not paged: `adminListPlans` takes no page arguments and returns every row in
 * sort order. The wrapper it returns has `total` equal to the row count and
 * `limit` equal to that too, which is honest rather than a page size.
 */

import { requireSupport } from "@/lib/admin/guard";
import { parsePlan, PLAN_GET, type AdminPlan } from "@/lib/admin/domain/plans";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export async function adminListPlans(
  includeInactive = false,
): Promise<ActResult<Paged<AdminPlan>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("plan", "adminListPlans", {
    set: { includeInactive },
    get: PLAN_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parsePlan));
}
