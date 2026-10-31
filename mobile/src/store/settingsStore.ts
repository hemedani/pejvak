import { Appearance } from "react-native";
import { create } from "zustand";

import { setHapticsPreference } from "@/lib/hapticsPreference";
import type { HistorySort } from "@/lib/history";
import {
  DEFAULT_SETTINGS,
  type MotionPreference,
  type ThemePreference,
} from "@/lib/settings";
import { SettingsService, subscribeToSettings } from "@/services/SettingsService";

type SettingsState = {
  themePreference: ThemePreference;
  defaultSpeed: number;
  historySort: HistorySort;
  motionPreference: MotionPreference;
  hapticsEnabled: boolean;
  languageCode: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (preference: ThemePreference) => Promise<void>;
  setDefaultSpeed: (speed: number) => Promise<void>;
  setHistorySort: (sort: HistorySort) => Promise<void>;
  setMotionPreference: (preference: MotionPreference) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  setLanguage: (code: string | null) => Promise<void>;
};

/** Forces RN's color scheme so `useColorScheme`/`useTheme` reflect the choice. */
function applyTheme(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const settings = await SettingsService.load();
      applyTheme(settings.themePreference);
      setHapticsPreference(settings.hapticsEnabled);
      set({ ...settings, loaded: true });
    } catch {
      // The defaults above are already in state. A failed read must not hold
      // the splash screen or keep the app on the wrong launch tab forever.
      set({ loaded: true });
    }
  },

  setTheme: async (preference) => {
    applyTheme(preference);
    set({ themePreference: preference });
    await SettingsService.setTheme(preference);
  },

  setDefaultSpeed: async (speed) => {
    set({ defaultSpeed: speed });
    await SettingsService.setDefaultSpeed(speed);
  },

  setHistorySort: async (sort) => {
    set({ historySort: sort });
    await SettingsService.setHistorySort(sort);
  },

  setMotionPreference: async (preference) => {
    set({ motionPreference: preference });
    await SettingsService.setMotionPreference(preference);
  },

  setHapticsEnabled: async (enabled) => {
    setHapticsPreference(enabled);
    set({ hapticsEnabled: enabled });
    await SettingsService.setHapticsEnabled(enabled);
  },

  setLanguage: async (code) => {
    set({ languageCode: code });
    await SettingsService.setLanguage(code);
  },
}));

// A snapshot that won on the server must reach the screens without waiting for
// a relaunch. The service owns the DB write; this is the UI's own refresh.
subscribeToSettings(() => {
  void useSettingsStore.getState().load();
});
