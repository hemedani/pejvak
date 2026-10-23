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
};

export const DEFAULT_SETTINGS: AppSettings = {
  themePreference: "system",
  defaultSpeed: 1,
  historySort: "newest",
  motionPreference: "system",
  hapticsEnabled: true,
};

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

export function parseDefaultSpeed(value: string | null): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return SPEED_OPTIONS.includes(parsed) ? parsed : DEFAULT_SETTINGS.defaultSpeed;
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
