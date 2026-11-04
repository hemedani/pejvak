"use server";

/**
 * One account, with its entitlement, its quota and its latest sessions.
 *
 * The page joins nothing: `adminGetUser` already returns the operator's view in
 * one round trip, and the recent sessions carry their track title. Asking for a
 * second list here would be a second source of truth for the same account.
 */

import { requireSupport } from "@/lib/admin/guard";
import { parseUserDetail, USER_DETAIL_GET, type UserDetail } from "@/lib/admin/domain/users";
import { wholeNumber } from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetUser(
  userId: string,
  sessionsLimit = 10,
): Promise<ActResult<UserDetail>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("user", "adminGetUser", {
    set: {
      userId,
      sessionsLimit: wholeNumber(sessionsLimit, 10, 0, 50),
    },
    get: USER_DETAIL_GET,
  });

  if (!result.success) {
    return result;
  }

  const detail = parseUserDetail(result.body);
  if (!detail) {
    return fail("server", "adminGetUser returned a payload that is not an account.");
  }

  return ok(detail);
}
