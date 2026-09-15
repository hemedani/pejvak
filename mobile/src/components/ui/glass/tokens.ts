/**
 * Glass tokens.
 *
 * Thin compatibility shim over `@/theme/tokens` so the glass primitives (and any
 * screen still importing `GlassRadius`) share one palette with the rest of the
 * app.
 */

import type { ColorValue } from "react-native";

import { colors, radius } from "@/theme/tokens";

export const GlassColors = {
  light: {
    canvas: colors.light.canvas,
    surface: colors.light.glass,
    surfaceStrong: colors.light.glassStrong,
    border: colors.light.glassBorder,
    highlight: colors.light.glassHighlight,
    shadow: colors.light.shadow,
    muted: colors.light.textSecondary,
  },
  dark: {
    canvas: colors.dark.canvas,
    surface: colors.dark.glass,
    surfaceStrong: colors.dark.glassStrong,
    border: colors.dark.glassBorder,
    highlight: colors.dark.glassHighlight,
    shadow: colors.dark.shadow,
    muted: colors.dark.textSecondary,
  },
} as const;

export type GlassTone = "surface" | "surfaceStrong";
export type GlassPalette = (typeof GlassColors)[keyof typeof GlassColors];

export const GlassRadius = {
  card: radius.lg,
  control: radius.md,
  panel: radius.panel,
  pill: radius.pill,
} as const;

export function glassFill(palette: GlassPalette, tone: GlassTone): ColorValue {
  return palette[tone];
}
