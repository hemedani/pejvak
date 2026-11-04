"use server";

/**
 * Create or edit a plan.
 *
 * Limits are partial: changing a price must not require resending every limit,
 * and an omitted limit keeps its value on the server. `-1` is the only accepted
 * negative, because it is the plan's word for unlimited; anything below it is a
 * typo the backend refuses.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parsePlan, PLAN_FIELDS, type AdminPlan } from "@/lib/admin/domain/plans";
import type { UpsertPlanInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminUpsertPlan(
  input: UpsertPlanInput,
): Promise<ActResult<AdminPlan>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("plan", "adminUpsertPlan", {
    set: {
      code: input.code.trim(),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.priceCents === undefined ? {} : { priceCents: input.priceCents }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.billingInterval === undefined
        ? {}
        : { billingInterval: input.billingInterval }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      ...(input.limits === undefined ? {} : { limits: input.limits }),
      ...(input.features === undefined ? {} : { features: input.features }),
    },
    get: PLAN_FIELDS,
  });

  if (!result.success) {
    return result;
  }

  const plan = parsePlan(result.body);
  if (!plan) {
    return fail("server", "adminUpsertPlan returned a payload that is not a plan.");
  }

  return ok(plan);
}
