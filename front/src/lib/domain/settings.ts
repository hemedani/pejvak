/**
 * The preferences that follow the listener between devices.
 *
 * Three of the phone's six preferences travel, and these are the three:
 *
 *   · `defaultSpeed` — the rate playback starts at;
 *   · `historySort` — the order History is read in;
 *   · `languageCode` — the one language chosen for online resources.
 *
 * The other three stay on the device that owns them, and the web agrees with
 * that split rather than widening it: a theme is a cookie here (`layout/theme-
 * toggle.tsx`), motion is the OS setting, and haptics do not exist in a browser.
 * A preference that only one client can act on is not a shared preference.
 *
 * `updatedAt` is the last-write-wins token, in epoch milliseconds. The backend
 * compares it with a conditional update that only matches a strictly newer
 * timestamp, so this module never has to decide who wins — it only has to send
 * an honest clock reading.
 */

import { HISTORY_SORT_OPTIONS, type HistorySort } from "../history";
import { asNumber, asRecord, asString, asTimestamp } from "../parse";

export type SharedSettings = {
  /** The one language chosen for online resources, or null for none. */
  languageCode: string | null;
  defaultSpeed: number;
  historySort: HistorySort;
  updatedAt: number;
};

export const DEFAULT_SHARED_SETTINGS: SharedSettings = {
  languageCode: null,
  defaultSpeed: 1,
  historySort: "newest",
  updatedAt: 0,
};

/**
 * The projection `getMySettings` and `updateMySettings` both accept.
 *
 * All four fields, deliberately: `pickSetting` on the server returns only the
 * keys asked for, so a narrower projection would make the response a partial
 * record and push the merging of "what I asked for" and "what I have" into every
 * caller.
 */
export const SETTINGS_GET = {
  languageCode: 1,
  defaultSpeed: 1,
  historySort: 1,
  updatedAt: 1,
} as const;

/**
 * The speeds the settings screen offers.
 *
 * Five, not the player menu's nine. The player's list is a transient choice made
 * mid-listen — someone wants 1.75× for one lecture — while this is a preference
 * that has to be readable at a glance and identical on the phone, whose settings
 * screen offers exactly these five. A control that offered nine would let a
 * listener pick a default the phone's own settings screen cannot display, and it
 * would show as "nothing chosen" there.
 *
 * `parseDefaultSpeed` still accepts the full 0.5–3 the backend validates, so a
 * value set elsewhere is displayed truthfully rather than clamped away; the
 * form adds it to the control so it never renders as "nothing selected".
 */
export const SPEED_OPTIONS: readonly number[] = [0.75, 1, 1.25, 1.5, 2];

/**
 * Reads a settings payload off the wire.
 *
 * Every field falls back on its own, mirroring `normalizeSharedSettings` in
 * `mobile/src/lib/settings.ts`: one unknown language, or a speed written by an
 * older build, must not discard the listener's other two choices. A whole-object
 * fallback would do exactly that, and the loss would be silent.
 */
export function parseSettings(raw: unknown): SharedSettings {
  const record = asRecord(raw);

  return {
    languageCode: parseLanguageCode(asString(record?.languageCode)),
    defaultSpeed: parseDefaultSpeed(asNumber(record?.defaultSpeed)),
    historySort: parseHistorySort(asString(record?.historySort)),
    updatedAt: asTimestamp(record?.updatedAt) ?? DEFAULT_SHARED_SETTINGS.updatedAt,
  };
}

/**
 * A stored language code, or null.
 *
 * Membership of the catalogue is not checked here. A code that has been removed
 * from the catalogue since it was chosen must stop offering its shortcut, not
 * turn a settings read into an error — the same rule the phone follows, and the
 * reason `AVAILABLE_LANGUAGES` is consulted at the point of use.
 */
export function parseLanguageCode(value: string | null): string | null {
  const code = value?.trim().toLowerCase() ?? "";
  return code.length > 0 ? code : null;
}

/** The backend's own range (0.5–3), so a legal value is never silently lost. */
export function parseDefaultSpeed(value: number | null): number {
  return value !== null && value >= 0.5 && value <= 3
    ? value
    : DEFAULT_SHARED_SETTINGS.defaultSpeed;
}

/** Derived from `HISTORY_SORT_OPTIONS` so the parser cannot drift from the list. */
export function parseHistorySort(value: string | null): HistorySort {
  const match = HISTORY_SORT_OPTIONS.find((option) => option.value === value);
  return match ? match.value : DEFAULT_SHARED_SETTINGS.historySort;
}
