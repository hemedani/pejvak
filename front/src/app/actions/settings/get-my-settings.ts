"use server";

/**
 * The listener's shared preferences.
 *
 * ## A failure to parse is not a failure to read
 *
 * `getMe` treats an unparseable payload as a `server` failure, because a shell
 * with no user has nothing to draw. This is the opposite case: `parseSettings`
 * never returns null — every field falls back on its own — so the worst outcome
 * of a changed response shape is 1× speed and newest-first history, which is
 * exactly what a listener who has never opened Settings has. Turning that into
 * an error state would replace a working screen with a message about a
 * preference nobody has expressed yet.
 */

import { callAct } from "@/lib/call-act";
import { parseSettings, SETTINGS_GET, type SharedSettings } from "@/lib/domain/settings";
import { ok, type ActResult } from "@/lib/result";

export async function getMySettings(): Promise<ActResult<SharedSettings>> {
  const result = await callAct("user", "getMySettings", {
    set: {},
    get: SETTINGS_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseSettings(result.body));
}
