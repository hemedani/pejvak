export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export type AppSettings = {
  themePreference: ThemePreference;
  defaultSpeed: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  themePreference: "system",
  defaultSpeed: 1,
};

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
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
