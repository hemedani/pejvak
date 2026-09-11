import { Appearance } from "react-native";
import { create } from "zustand";

import { DEFAULT_SETTINGS, type ThemePreference } from "@/lib/settings";
import { SettingsService } from "@/services/SettingsService";

type SettingsState = {
  themePreference: ThemePreference;
  defaultSpeed: number;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (preference: ThemePreference) => Promise<void>;
  setDefaultSpeed: (speed: number) => Promise<void>;
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
}));
