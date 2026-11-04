"use server";

/**
 * The account table.
 *
 * A read, so `support` may call it. The guard runs before the act: the layout
 * hides the page from a listener, but a Server Action is a POST that can be
 * made directly.
 */

import { requireSupport } from "@/lib/admin/guard";
import { parseUserRow, USER_ROW_GET, type AdminUser } from "@/lib/admin/domain/users";
import { parsePaged, type Paged } from "@/lib/admin/domain/common";
import {
  boundedLimit,
  boundedPage,
  oneOf,
  trimmed,
  USER_ROLES,
  USER_SORT_FIELDS,
  USER_STATUSES,
  type AdminUserQuery,
} from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { ok, type ActResult } from "@/lib/result";

export async function adminListUsers(
  query: AdminUserQuery = {},
): Promise<ActResult<Paged<AdminUser>>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const role = oneOf(query.role, USER_ROLES);
  const status = oneOf(query.status, USER_STATUSES);
  const sortBy = oneOf(query.sortBy, USER_SORT_FIELDS);
  const search = trimmed(query.search);
  const planCode = trimmed(query.planCode);

  const result = await callAct("user", "adminListUsers", {
    set: {
      page: boundedPage(query.page),
      limit: boundedLimit(query.limit),
      ...(search === undefined ? {} : { search }),
      ...(role === undefined ? {} : { role }),
      ...(status === undefined ? {} : { status }),
      ...(planCode === undefined ? {} : { planCode }),
      ...(sortBy === undefined ? {} : { sortBy }),
      ...(query.sortOrder === undefined ? {} : { sortOrder: query.sortOrder }),
    },
    get: USER_ROW_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parsePaged(result.body, parseUserRow));
}
