/**
 * Compatibility layer over `@/theme`.
 *
 * The canonical design system lives in `src/theme/tokens.ts` and
 * `src/theme/motion.ts`. This module keeps the original import surface working
 * (`Colors`, `Fonts`, `Spacing`, `MaxContentWidth`, `ThemeColor`) so existing
 * screens and the `useTheme()` hook keep resolving, while adding the richer
 * semantic names (`accent`, `glass`, `canvas`, …) on top.
 *
 * New code should prefer importing from `@/theme` directly.
 */

import "@/global.css";

import { Platform } from "react-native";

import { colors, layout, type SemanticColors } from "@/theme/tokens";

/** The semantic palette plus the original shorthand keys. */
export type AppColors = SemanticColors & {
  /** @deprecated use `canvas` */
  background: string;
  /** @deprecated use `glass` */
  backgroundElement: string;
  /** @deprecated use `glassStrong` */
  backgroundSelected: string;
  /** @deprecated use `accent` */
  tint: string;
};

function build(scheme: "light" | "dark"): AppColors {
  const semantic = colors[scheme];
  return {
    ...semantic,
    background: semantic.canvas,
    backgroundElement: semantic.glass,
    backgroundSelected: semantic.glassStrong,
    tint: semantic.accent,
  };
}

export const Colors: Record<"light" | "dark", AppColors> = {
  light: build("light"),
  dark: build("dark"),
};

export type ThemeColor = keyof AppColors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

/** Legacy spacing scale. New code should use `spacing` from `@/theme`. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = layout.tabBarInset;
export const MaxContentWidth = layout.maxContentWidth;
