"use server";

/**
 * The global switches.
 *
 * Reads through the same act the register flow uses for its defaults, so a fresh
 * database shows "signups enabled" here because that is what a signup would
 * assume — not because this page has its own idea.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parsePlatformSetting,
  PLATFORM_GET,
  type PlatformSetting,
} from "@/lib/admin/domain/platform";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetPlatformSetting(): Promise<ActResult<PlatformSetting>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("platformSetting", "adminGetPlatformSetting", {
    set: {},
    get: PLATFORM_GET,
  });

  if (!result.success) {
    return result;
  }

  const setting = parsePlatformSetting(result.body);
  if (!setting) {
    return fail(
      "server",
      "adminGetPlatformSetting returned a payload that is not a platform setting.",
    );
  }

  return ok(setting);
}
