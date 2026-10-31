import {
  DEFAULT_SETTINGS,
  isThemePreference,
  normalizeSharedSettings,
  parseBoolean,
  parseDefaultSpeed,
  parseHistorySort,
  parseLanguageCode,
  parseMotionPreference,
  type AppSettings,
  type MotionPreference,
  type SharedSettings,
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
  language: "languageCode",
  settingsUpdatedAt: "settingsUpdatedAt",
  settingsSyncedAt: "settingsSyncedAt",
  lastSyncAt: "lastSyncAt",
} as const;

/**
 * Notified after a server snapshot wins. The Zustand store uses it to adopt the
 * new values live without the sync layer importing the UI store.
 */
const settingsListeners = new Set<() => void>();

export function subscribeToSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

function notifySettingsChanged(): void {
  for (const listener of settingsListeners) {
    listener();
  }
}

function parseTimestamp(value: string | null): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

async function getSettingsUpdatedAt(): Promise<number> {
  return parseTimestamp(await LocalDBService.getSetting(KEYS.settingsUpdatedAt));
}

async function getSettingsSyncedAt(): Promise<number> {
  return parseTimestamp(await LocalDBService.getSetting(KEYS.settingsSyncedAt));
}

async function markSettingsSyncedToken(updatedAt: number): Promise<void> {
  const [syncedAt, current] = await Promise.all([
    getSettingsSyncedAt(),
    getSettingsUpdatedAt(),
  ]);
  // A response can arrive after a newer local change; that change is still owed.
  const acknowledged = Math.min(Math.max(0, Math.trunc(updatedAt)), current);
  const next = Math.max(syncedAt, acknowledged);
  if (next !== syncedAt) {
    await LocalDBService.setSetting(KEYS.settingsSyncedAt, String(next));
  }
}

async function readSharedSettings(): Promise<SharedSettings> {
  const [language, speed, historySort, updatedAt] = await Promise.all([
    LocalDBService.getSetting(KEYS.language),
    LocalDBService.getSetting(KEYS.speed),
    LocalDBService.getSetting(KEYS.historySort),
    getSettingsUpdatedAt(),
  ]);
  return normalizeSharedSettings({
    languageCode: parseLanguageCode(language),
    defaultSpeed: parseDefaultSpeed(speed),
    historySort: parseHistorySort(historySort),
    updatedAt,
  });
}

/**
 * Advances the shared LWW token after a local change.
 *
 * Reading the previous value keeps two changes in the same millisecond ordered:
 * the server ignores an equal timestamp, so a rapid second tap would otherwise
 * look like a replay and be lost.
 */
async function markSettingsChanged(): Promise<number> {
  const previous = await getSettingsUpdatedAt();
  const next = Math.max(Date.now(), previous + 1);
  await LocalDBService.setSetting(KEYS.settingsUpdatedAt, String(next));
  return next;
}

export const SettingsService = {
  async load(): Promise<AppSettings> {
    const [theme, speed, historySort, motion, haptics, language] = await Promise.all([
      LocalDBService.getSetting(KEYS.theme),
      LocalDBService.getSetting(KEYS.speed),
      LocalDBService.getSetting(KEYS.historySort),
      LocalDBService.getSetting(KEYS.motion),
      LocalDBService.getSetting(KEYS.haptics),
      LocalDBService.getSetting(KEYS.language),
    ]);
    return {
      themePreference: isThemePreference(theme)
        ? theme
        : DEFAULT_SETTINGS.themePreference,
      defaultSpeed: parseDefaultSpeed(speed),
      historySort: parseHistorySort(historySort),
      motionPreference: parseMotionPreference(motion),
      hapticsEnabled: parseBoolean(haptics, DEFAULT_SETTINGS.hapticsEnabled),
      languageCode: parseLanguageCode(language),
    };
  },

  async setTheme(preference: ThemePreference): Promise<void> {
    await LocalDBService.setSetting(KEYS.theme, preference);
  },

  async setDefaultSpeed(speed: number): Promise<void> {
    await LocalDBService.setSetting(KEYS.speed, String(speed));
    await markSettingsChanged();
  },

  async setHistorySort(sort: HistorySort): Promise<void> {
    await LocalDBService.setSetting(KEYS.historySort, sort);
    await markSettingsChanged();
  },

  async setMotionPreference(preference: MotionPreference): Promise<void> {
    await LocalDBService.setSetting(KEYS.motion, preference);
  },

  async setHapticsEnabled(enabled: boolean): Promise<void> {
    await LocalDBService.setSetting(KEYS.haptics, String(enabled));
  },

  /** Clearing stores an empty string, which `parseLanguageCode` reads as none. */
  async setLanguage(code: string | null): Promise<void> {
    await LocalDBService.setSetting(KEYS.language, code ?? "");
    await markSettingsChanged();
  },

  getSharedSettings: readSharedSettings,

  /**
   * The snapshot a sync still owes the server, or null when the last change has
   * already been acknowledged. Without this, every timer tick would re-send the
   * same snapshot forever — including when the device is offline.
   */
  async getPendingSharedSettings(): Promise<SharedSettings | null> {
    const [settings, syncedAt] = await Promise.all([
      readSharedSettings(),
      getSettingsSyncedAt(),
    ]);
    return settings.updatedAt > syncedAt ? settings : null;
  },

  /** Records that the server acknowledged a snapshot; never moves backwards. */
  markSettingsSynced: markSettingsSyncedToken,

  /**
   * Adopts the server's snapshot when it is newer — or when it ties and differs,
   * because the server's conditional write keeps the first of two equal
   * timestamps, so the canonical value is the tie-breaker. An older snapshot
   * lost last-write-wins and is ignored.
   *
   * `expectedUpdatedAt` marks the response to a snapshot this device just sent.
   * The server clamps a future device clock to its own, so that response can
   * carry a *lower* token than the one sent; accepting it is what re-aligns the
   * device clock instead of leaving a timestamp nothing can ever beat. A local
   * change made while the request was in flight is strictly newer than the sent
   * token and is therefore not overwritten.
   */
  async applyRemoteSettings(
    remote: SharedSettings,
    expectedUpdatedAt?: number,
  ): Promise<boolean> {
    const settings = normalizeSharedSettings(remote);
    const local = await readSharedSettings();
    const authoritative =
      expectedUpdatedAt !== undefined && local.updatedAt <= expectedUpdatedAt;

    if (!authoritative && settings.updatedAt < local.updatedAt) {
      return false;
    }

    const valuesDiffer =
      settings.languageCode !== local.languageCode ||
      settings.defaultSpeed !== local.defaultSpeed ||
      settings.historySort !== local.historySort;
    const tokenChanged = settings.updatedAt !== local.updatedAt;

    // Write the values before the token: a kill mid-apply must retry the whole
    // snapshot, not claim it was accepted after writing only its first field.
    if (valuesDiffer) {
      await LocalDBService.setSetting(KEYS.language, settings.languageCode ?? "");
      await LocalDBService.setSetting(KEYS.speed, String(settings.defaultSpeed));
      await LocalDBService.setSetting(KEYS.historySort, settings.historySort);
    }
    if (tokenChanged) {
      await LocalDBService.setSetting(KEYS.settingsUpdatedAt, String(settings.updatedAt));
    }
    if (authoritative) {
      // The server's token is canonical, even when it is below the one sent.
      await LocalDBService.setSetting(
        KEYS.settingsSyncedAt,
        String(settings.updatedAt),
      );
    } else {
      await markSettingsSyncedToken(settings.updatedAt);
    }

    if (valuesDiffer) {
      notifySettingsChanged();
    }
    return tokenChanged || valuesDiffer;
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
