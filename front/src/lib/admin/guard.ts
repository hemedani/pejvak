/**
 * The server-side gate every admin action calls first.
 *
 * A normal module, not `"use server"`: `"use server"` modules may only export
 * async functions, and this one is imported by actions rather than called from
 * the client. The layout is not enough — a Server Action is a POST to its own
 * route and can be invoked directly.
 *
 * The refusal is `validation`, never `unauthorized`. `callAct` signs the
 * operator out on `unauthorized`, which would turn "support may not revoke a
 * subscription" into "your session ended".
 */

import { getMe } from "@/app/actions/auth/get-me";
import type { CurrentUser } from "@/lib/domain/user";
import { fail, type ActResult } from "@/lib/result";

import { canMutate, isOperatorRole } from "./roles";

const NEEDS_ADMIN = "This action requires an admin account";

/**
 * Re-reads the signed-in account for every call.
 *
 * No cache: the cookie decides who this is, and a cached identity spanning
 * requests would be a security bug, not an optimisation.
 */
async function currentOperator(): Promise<ActResult<CurrentUser>> {
  return getMe();
}

/** Any operator (`support` or `admin`) may read. */
export async function requireSupport(): Promise<ActResult<CurrentUser>> {
  const result = await currentOperator();

  if (!result.success) {
    return result;
  }

  if (!isOperatorRole(result.body.role)) {
    return fail("validation", NEEDS_ADMIN);
  }

  return result;
}

/** Only `admin` may mutate. */
export async function requireAdmin(): Promise<ActResult<CurrentUser>> {
  const result = await currentOperator();

  if (!result.success) {
    return result;
  }

  if (!canMutate(result.body.role)) {
    return fail("validation", NEEDS_ADMIN);
  }

  return result;
}
