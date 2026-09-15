/**
 * Theme resolution.
 *
 * The user's Appearance preference (Settings → Appearance) wins over the OS
 * scheme, so switching between System / Light / Dark takes effect immediately.
 */

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSettingsStore } from "@/store/settingsStore";
import { Colors, type AppColors } from "@/constants/theme";
import type { ColorScheme } from "@/theme/tokens";

/** The resolved colour scheme: explicit preference first, OS second. */
export function useScheme(): ColorScheme {
  const system = useColorScheme();
  const preference = useSettingsStore((state) => state.themePreference);

  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return system === "dark" ? "dark" : "light";
}

/**
 * The palette for the resolved scheme. Carries the semantic names (`accent`,
 * `glass`, `canvas`, …) plus the original shorthand keys (`tint`,
 * `backgroundElement`, …) so both generations of screens resolve.
 */
export function useTheme(): AppColors {
  return Colors[useScheme()];
}
