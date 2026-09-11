import {
  DEFAULT_SETTINGS,
  isThemePreference,
  parseDefaultSpeed,
  type AppSettings,
  type ThemePreference,
} from "@/lib/settings";
import { LocalDBService } from "@/services/LocalDBService";

const KEYS = {
  theme: "themePreference",
  speed: "defaultSpeed",
  lastSyncAt: "lastSyncAt",
} as const;

export const SettingsService = {
  async load(): Promise<AppSettings> {
    const [theme, speed] = await Promise.all([
      LocalDBService.getSetting(KEYS.theme),
      LocalDBService.getSetting(KEYS.speed),
    ]);
    return {
      themePreference: isThemePreference(theme)
        ? theme
        : DEFAULT_SETTINGS.themePreference,
      defaultSpeed: parseDefaultSpeed(speed),
    };
  },

  async setTheme(preference: ThemePreference): Promise<void> {
    await LocalDBService.setSetting(KEYS.theme, preference);
  },

  async setDefaultSpeed(speed: number): Promise<void> {
    await LocalDBService.setSetting(KEYS.speed, String(speed));
  },

  async getLastSyncAt(): Promise<number | null> {
    const value = await LocalDBService.getSetting(KEYS.lastSyncAt);
    const parsed = value === null ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  },

  async setLastSyncAt(timestampMs: number): Promise<void> {
    await LocalDBService.setSetting(KEYS.lastSyncAt, String(timestampMs));
  },
};
