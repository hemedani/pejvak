import { HISTORY_SORT_OPTIONS, type HistorySort } from "@/lib/history";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

/** How much motion the app should play, independent of the OS setting. */
export type MotionPreference = "system" | "full" | "reduced";

export const MOTION_PREFERENCES: MotionPreference[] = ["system", "full", "reduced"];

export type AppSettings = {
  themePreference: ThemePreference;
  defaultSpeed: number;
  historySort: HistorySort;
  motionPreference: MotionPreference;
  hapticsEnabled: boolean;
  /** The one language the listener chose for online resources, or null. */
  languageCode: string | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  themePreference: "system",
  defaultSpeed: 1,
  historySort: "newest",
  motionPreference: "system",
  hapticsEnabled: true,
  languageCode: null,
};

/**
 * The preferences that follow the listener between devices.
 *
 * `updatedAt` is the last-write-wins token, in epoch milliseconds. Device-only
 * preferences are deliberately absent: a theme or a haptics switch belongs to
 * this phone, not to the account.
 */
export type SharedSettings = {
  languageCode: string | null;
  defaultSpeed: number;
  historySort: HistorySort;
  updatedAt: number;
};

export const DEFAULT_SHARED_SETTINGS: SharedSettings = {
  languageCode: DEFAULT_SETTINGS.languageCode,
  defaultSpeed: DEFAULT_SETTINGS.defaultSpeed,
  historySort: DEFAULT_SETTINGS.historySort,
  updatedAt: 0,
};

/**
 * Coerces a value that came from storage or the wire. Each field falls back on
 * its own, so one unknown language or an old speed cannot discard the rest of
 * the listener's choices.
 */
export function normalizeSharedSettings(input: {
  languageCode?: string | null;
  defaultSpeed?: number;
  historySort?: string | null;
  updatedAt?: number;
}): SharedSettings {
  const updatedAt = input.updatedAt;
  return {
    languageCode: parseLanguageCode(input.languageCode ?? null),
    defaultSpeed: parseDefaultSpeed(
      input.defaultSpeed === undefined ? null : String(input.defaultSpeed),
    ),
    historySort: parseHistorySort(input.historySort ?? null),
    updatedAt:
      typeof updatedAt === "number" && Number.isFinite(updatedAt)
        ? Math.max(0, Math.trunc(updatedAt))
        : DEFAULT_SHARED_SETTINGS.updatedAt,
  };
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Derived from `MOTION_PREFERENCES` so the parser cannot drift from the list. */
export function parseMotionPreference(value: string | null): MotionPreference {
  const match = MOTION_PREFERENCES.find((preference) => preference === value);
  return match ?? DEFAULT_SETTINGS.motionPreference;
}

/** Stored booleans are the literal strings `"true"` and `"false"`. */
export function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

/** Derived from `HISTORY_SORT_OPTIONS` so the two cannot drift apart. */
export function parseHistorySort(value: string | null): HistorySort {
  const match = HISTORY_SORT_OPTIONS.find((option) => option.value === value);
  return match ? match.value : DEFAULT_SETTINGS.historySort;
}

/**
 * A stored language code, or null.
 *
 * The catalogue validates membership, not this parser: a code that was removed
 * from the catalogue since it was chosen must simply stop offering its tab
 * rather than turning a settings read into an error.
 */
export function parseLanguageCode(value: string | null): string | null {
  const code = value?.trim() ?? "";
  return code.length > 0 ? code : null;
}

export function parseDefaultSpeed(value: string | null): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 3
    ? parsed
    : DEFAULT_SETTINGS.defaultSpeed;
}

/** Human file size: "512 B", "1.5 KB", "1.0 MB", "1.0 GB". */
export function formatBytes(bytes: number): string {
  const value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }
  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 ** 3) {
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}
