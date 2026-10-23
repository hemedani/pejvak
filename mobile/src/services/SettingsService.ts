import {
  DEFAULT_SETTINGS,
  isThemePreference,
  parseBoolean,
  parseDefaultSpeed,
  parseHistorySort,
  parseMotionPreference,
  type AppSettings,
  type MotionPreference,
  type ThemePreference,
} from "@/lib/settings";
import type { HistorySort } from "@/lib/history";
import { LocalDBService } from "@/services/LocalDBService";

const KEYS = {
  theme: "themePreference",
  speed: "defaultSpeed",
  historySort: "historySort",
  motion: "motionPreference",
  haptics: "hapticsEnabled",
  lastSyncAt: "lastSyncAt",
} as const;

export const SettingsService = {
  async load(): Promise<AppSettings> {
    const [theme, speed, historySort, motion, haptics] = await Promise.all([
      LocalDBService.getSetting(KEYS.theme),
      LocalDBService.getSetting(KEYS.speed),
      LocalDBService.getSetting(KEYS.historySort),
      LocalDBService.getSetting(KEYS.motion),
      LocalDBService.getSetting(KEYS.haptics),
    ]);
    return {
      themePreference: isThemePreference(theme)
        ? theme
        : DEFAULT_SETTINGS.themePreference,
      defaultSpeed: parseDefaultSpeed(speed),
      historySort: parseHistorySort(historySort),
      motionPreference: parseMotionPreference(motion),
      hapticsEnabled: parseBoolean(haptics, DEFAULT_SETTINGS.hapticsEnabled),
    };
  },

  async setTheme(preference: ThemePreference): Promise<void> {
    await LocalDBService.setSetting(KEYS.theme, preference);
  },

  async setDefaultSpeed(speed: number): Promise<void> {
    await LocalDBService.setSetting(KEYS.speed, String(speed));
  },

  async setHistorySort(sort: HistorySort): Promise<void> {
    await LocalDBService.setSetting(KEYS.historySort, sort);
  },

  async setMotionPreference(preference: MotionPreference): Promise<void> {
    await LocalDBService.setSetting(KEYS.motion, preference);
  },

  async setHapticsEnabled(enabled: boolean): Promise<void> {
    await LocalDBService.setSetting(KEYS.haptics, String(enabled));
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
