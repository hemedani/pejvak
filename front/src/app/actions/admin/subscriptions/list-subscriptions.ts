"use server";

/**
 * The subscription table.
 *
 * Sorted by the server by `currentPeriodEnd` ascending. Rows without an end
 * (lifetime) exist, so the page re-sorts for display and puts them last rather
 * than trusting Mongo's treatment of a missing value.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseSubscription,
  SUBSCRIPTION_GET,
  type AdminSubscription,
} from "@/lib/admin/domain/subscriptions";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import {
  boundedLimit,
  boundedPage,
  oneOf,
  SUBSCRIPTION_STATUSES,
  trimmed,
  type AdminSubscriptionQuery,
} from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export async function adminListSubscriptions(
  query: AdminSubscriptionQuery = {},
): Promise<ActResult<Paged<AdminSubscription>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const status = oneOf(query.status, SUBSCRIPTION_STATUSES);
  const planCode = trimmed(query.planCode);
  const search = trimmed(query.search);

  const result = await callAct("subscription", "adminListSubscriptions", {
    set: {
      page: boundedPage(query.page),
      limit: boundedLimit(query.limit),
      ...(status === undefined ? {} : { status }),
      ...(planCode === undefined ? {} : { planCode }),
      ...(search === undefined ? {} : { search }),
    },
    get: SUBSCRIPTION_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parseSubscription));
}
