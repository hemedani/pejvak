"use server";

/**
 * Reset a password, and return the generated one exactly once.
 *
 * The password is never written to the audit log. The panel shows it in a
 * one-time panel with a copy button; it is not persisted anywhere else and it is
 * not re-readable after the action returns.
 */

import { requireAdmin } from "@/lib/admin/guard";
import type { ResetPasswordInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { asBoolean, asRecord, asString } from "@/lib/parse";
import { fail, ok, type ActResult } from "@/lib/result";

export type ResetPasswordResult = {
  userId: string;
  password: string;
  generated: boolean;
};

export async function adminResetUserPassword(
  input: ResetPasswordInput,
): Promise<ActResult<ResetPasswordResult>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("user", "adminResetUserPassword", {
    set: {
      userId: input.userId,
      ...(input.password === undefined ? {} : { password: input.password }),
    },
    get: { userId: 1, password: 1, generated: 1 },
  });

  if (!result.success) {
    return result;
  }

  const body = asRecord(result.body);
  const userId = asString(body?.userId);
  const password = asString(body?.password);

  if (!userId || !password) {
    return fail("server", "adminResetUserPassword did not return the new password.");
  }

  return ok({ userId, password, generated: asBoolean(body?.generated) });
}
