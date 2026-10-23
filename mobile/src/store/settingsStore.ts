import { Appearance } from "react-native";
import { create } from "zustand";

import { setHapticsPreference } from "@/lib/hapticsPreference";
import type { HistorySort } from "@/lib/history";
import {
  DEFAULT_SETTINGS,
  type MotionPreference,
  type ThemePreference,
} from "@/lib/settings";
import { SettingsService } from "@/services/SettingsService";

type SettingsState = {
  themePreference: ThemePreference;
  defaultSpeed: number;
  historySort: HistorySort;
  motionPreference: MotionPreference;
  hapticsEnabled: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (preference: ThemePreference) => Promise<void>;
  setDefaultSpeed: (speed: number) => Promise<void>;
  setHistorySort: (sort: HistorySort) => Promise<void>;
  setMotionPreference: (preference: MotionPreference) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
};

/** Forces RN's color scheme so `useColorScheme`/`useTheme` reflect the choice. */
function applyTheme(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await SettingsService.load();
    applyTheme(settings.themePreference);
    setHapticsPreference(settings.hapticsEnabled);
    set({ ...settings, loaded: true });
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
}));
