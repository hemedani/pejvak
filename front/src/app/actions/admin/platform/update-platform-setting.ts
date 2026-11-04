"use server";

/**
 * Flip the four global switches.
 *
 * No other field belongs here. Prices and limits are plan rows because they are
 * sold; putting them in a second place would give the same question two answers.
 * An empty announcement is sent as an empty string so the backend can clear it.
 */

import { requireAdmin } from "@/lib/admin/guard";
import {
  parsePlatformSetting,
  PLATFORM_GET,
  type PlatformSetting,
} from "@/lib/admin/domain/platform";
import type { UpdatePlatformInput } from "@/lib/admin/forms";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminUpdatePlatformSetting(
  input: UpdatePlatformInput,
): Promise<ActResult<PlatformSetting>> {
  const guard = await requireAdmin();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("platformSetting", "adminUpdatePlatformSetting", {
    set: {
      ...(input.signupsEnabled === undefined
        ? {}
        : { signupsEnabled: input.signupsEnabled }),
      ...(input.aiEnabled === undefined ? {} : { aiEnabled: input.aiEnabled }),
      ...(input.maintenanceMode === undefined
        ? {}
        : { maintenanceMode: input.maintenanceMode }),
      ...(input.announcement === undefined
        ? {}
        : { announcement: input.announcement }),
    },
    get: PLATFORM_GET,
  });

  if (!result.success) {
    return result;
  }

  const setting = parsePlatformSetting(result.body);
  if (!setting) {
    return fail(
      "server",
      "adminUpdatePlatformSetting returned a payload that is not a platform setting.",
    );
  }

  return ok(setting);
}
