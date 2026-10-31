"use server";

/**
 * Change one preference, or all three.
 *
 * ## A patch, not a snapshot
 *
 * `updateMySettings` merges with `mode: "patch"`, so an omitted field keeps
 * whatever it had. That is what makes saving on change safe: the speed control
 * sends `{ defaultSpeed }` and cannot clobber a language chosen on the phone
 * five seconds earlier, and two controls touched in quick succession cannot
 * erase each other. The timestamp is read here, at the moment of the write, so
 * last-write-wins compares when the listener acted rather than when the request
 * landed.
 *
 * ## `null` leaves as the empty string
 *
 * The generated declaration types `set.languageCode` as `string`, not
 * `string | null`, while the backend accepts null. Clearing the choice is
 * therefore `""` — which the server's `normalizeLanguageCode` turns back into
 * null. Sending nothing would be a different request entirely: a patch that
 * omits the field keeps the old language, so "no preference" would be
 * unexpressible.
 *
 * ## Checked here as well as in the form
 *
 * A Server Action is a public endpoint. The range and the catalogue membership
 * are re-asserted before the round trip, so a hand-made call becomes a clean
 * validation result instead of a backend error with a Mongoose stack in it.
 */

import { callAct } from "@/lib/call-act";
import {
  parseSettings,
  SETTINGS_GET,
  SPEED_OPTIONS,
  type SharedSettings,
} from "@/lib/domain/settings";
import type { HistorySort } from "@/lib/history";
import { AVAILABLE_LANGUAGES } from "@/lib/online/languages";
import { fail, ok, type ActResult } from "@/lib/result";

const LANGUAGE_MAX = 16;
const SORT_VALUES: readonly HistorySort[] = ["newest", "oldest", "longest"];

export type SettingsPatch = {
  /** `null` clears the choice. */
  languageCode?: string | null;
  defaultSpeed?: number;
  historySort?: HistorySort;
};

export async function updateMySettings(
  patch: SettingsPatch,
): Promise<ActResult<SharedSettings>> {
  const set: {
    languageCode?: string;
    defaultSpeed?: number;
    historySort?: HistorySort;
    updatedAt: number;
  } = { updatedAt: Date.now() };

  if (patch.languageCode !== undefined) {
    const code = patch.languageCode?.trim().toLowerCase() ?? "";

    if (code.length > LANGUAGE_MAX) {
      return fail("validation", "A language code is at most 16 characters.");
    }
    if (code.length > 0 && !AVAILABLE_LANGUAGES.some((language) => language.code === code)) {
      return fail("validation", "That language has no source to browse.");
    }

    set.languageCode = code;
  }

  if (patch.defaultSpeed !== undefined) {
    const speed = patch.defaultSpeed;

    // The same range the backend's `refine` enforces, and membership of the list
    // the control offers — a value between the two bounds but off the list would
    // be stored, displayed, and then be unselectable in the form that set it.
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 3) {
      return fail("validation", "A playback speed must be between 0.5× and 3×.");
    }
    if (!SPEED_OPTIONS.includes(speed)) {
      return fail("validation", "That playback speed is not one of the offered rates.");
    }

    set.defaultSpeed = speed;
  }

  if (patch.historySort !== undefined) {
    if (!SORT_VALUES.includes(patch.historySort)) {
      return fail("validation", "That is not one of the history orders.");
    }
    set.historySort = patch.historySort;
  }

  const result = await callAct("user", "updateMySettings", {
    set,
    get: SETTINGS_GET,
  });

  if (!result.success) {
    return result;
  }

  // The act answers with the merged row, not with the patch. Reading it back is
  // what lets the form show the state the server actually holds — including the
  // case where a write from another device arrived with a later timestamp and
  // this one lost.
  return ok(parseSettings(result.body));
}
