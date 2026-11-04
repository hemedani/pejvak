"use server";

/**
 * Edit an account, including its role and status.
 *
 * The backend refuses self-demotion, self-suspension and removing the last
 * admin. Those are authorization rules, not form validation, so they live there
 * and this action forwards the values untouched. Trimming a blank optional field
 * to "not sent" is the only normalisation it does.
 */

import { requireAdmin } from "@/lib/admin/guard";
import { parseUserRow, USER_ROW_GET, type AdminUser } from "@/lib/admin/domain/users";
import type { UpdateUserInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminUpdateUser(
  input: UpdateUserInput,
): Promise<ActResult<AdminUser>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("user", "adminUpdateUser", {
    set: {
      userId: input.userId,
      ...(input.username === undefined ? {} : { username: input.username }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.suspendedReason === undefined
        ? {}
        : { suspendedReason: input.suspendedReason }),
    },
    get: USER_ROW_GET,
  });

  if (!result.success) {
    return result;
  }

  const user = parseUserRow(result.body);
  if (!user) {
    return fail("server", "adminUpdateUser returned a payload that is not an account.");
  }

  return ok(user);
}
