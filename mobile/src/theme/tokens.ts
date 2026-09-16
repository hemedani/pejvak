/**
 * Pejvak design tokens — the single source of truth for the visual language.
 *
 * The look: clean, calm, glassy. Soft neutrals in the canvas so frosted panels
 * read as glass instead of grey boxes, one saturated accent per theme, and a
 * small family of "aurora" gradient pairs that give every track its own colour
 * identity on the now-playing canvas.
 *
 * Anything that a screen needs to make a visual decision should come from here
 * (or from `motion.ts`), never from an inline literal.
 */

import { Platform, StyleSheet, type ColorValue } from "react-native";

export type ColorScheme = "light" | "dark";

/** 4pt rhythm. Named by step so layouts read the same in every file. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 44,
  giant: 64,
} as const;

export const radius = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 30,
  xxl: 38,
  /** Mini-player / sheet collapsed state. */
  panel: 28,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

/**
 * Type scale. Display sizes carry negative tracking so large text stays tight
 * and premium rather than airy; small sizes get slight positive tracking.
 */
export const typeScale = {
  hero: { fontSize: 40, lineHeight: 44, fontWeight: "700", letterSpacing: -1.1 },
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: "500", letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: "700", letterSpacing: -0.1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500", letterSpacing: 0.05 },
  /** All-caps eyebrow above a section title. */
  overline: { fontSize: 11, lineHeight: 15, fontWeight: "700", letterSpacing: 1.3 },
  /** Tabular-ish numeric readout for time codes. */
  numeric: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.2 },
} as const;

export type TypeVariant = keyof typeof typeScale;

export type SemanticColors = {
  /** Page background. */
  canvas: string;
  /** Slightly lifted canvas used behind glass so the blur has something to chew on. */
  canvasElevated: string;
  /** Translucent fill for a frosted panel. */
  glass: string;
  /** More opaque frosted fill, for panels that must stay legible over busy art. */
  glassStrong: string;
  /** Hairline border around glass. */
  glassBorder: string;
  /** Top specular edge — the "wet" highlight that sells the glass. */
  glassHighlight: string;
  shadow: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Brand accent. */
  accent: string;
  /** Accent at low alpha, for selected chips and glows. */
  accentSoft: string;
  /** Text/icon colour that sits on top of `accent`. */
  onAccent: string;
  danger: string;
  /** Dim behind a modal sheet. */
  scrim: string;
  /** Inactive portion of a progress track. */
  track: string;
  /** Neutral icon colour. */
  icon: string;
};

const light: SemanticColors = {
  canvas: "#EEF1F6",
  canvasElevated: "#F7F9FC",
  glass: "rgba(255, 255, 255, 0.58)",
  glassStrong: "rgba(255, 255, 255, 0.82)",
  glassBorder: "rgba(255, 255, 255, 0.7)",
  glassHighlight: "rgba(255, 255, 255, 0.9)",
  shadow: "rgba(20, 32, 39, 0.16)",
  text: "#101B22",
  textSecondary: "#5A6B74",
  textTertiary: "#646F75",
  accent: "#0D7B72",
  accentSoft: "rgba(13, 123, 114, 0.14)",
  onAccent: "#FFFFFF",
  danger: "#C23E54",
  scrim: "rgba(12, 18, 24, 0.38)",
  track: "rgba(90, 107, 116, 0.22)",
  icon: "#2C3A43",
};

const dark: SemanticColors = {
  canvas: "#080B11",
  canvasElevated: "#111823",
  glass: "rgba(28, 37, 50, 0.52)",
  glassStrong: "rgba(30, 40, 54, 0.78)",
  glassBorder: "rgba(226, 238, 255, 0.14)",
  glassHighlight: "rgba(255, 255, 255, 0.22)",
  shadow: "rgba(0, 0, 0, 0.55)",
  text: "#F2F7F5",
  textSecondary: "#A4B6BC",
  textTertiary: "#70838D",
  accent: "#5FD9C6",
  accentSoft: "rgba(95, 217, 198, 0.16)",
  onAccent: "#04231F",
  danger: "#FF7A8F",
  scrim: "rgba(0, 0, 0, 0.58)",
  track: "rgba(164, 182, 188, 0.22)",
  icon: "#D6E2E6",
};

export const colors: Record<ColorScheme, SemanticColors> = { light, dark };

/**
 * Aurora gradient pairs. Each track resolves deterministically to one of these,
 * which becomes its canvas background and accent glow. Two stops each, tuned to
 * stay behind text without washing it out.
 */
export const aurora: readonly (readonly [string, string, string])[] = [
  ["#0D7B72", "#1FB6A6", "#0B4F52"],
  ["#3B6FF5", "#6AA8FF", "#182B6B"],
  ["#8A4DFF", "#C48CFF", "#2C1656"],
  ["#F0625C", "#FF9E7A", "#5A1D24"],
  ["#F2A93B", "#FFD27A", "#5A3A10"],
  ["#12A594", "#4FD1C5", "#0B4A44"],
  ["#E24E9B", "#FF8FC4", "#5A1440"],
  ["#2E9BE0", "#69D2F0", "#0C3550"],
] as const;

export type AuroraRamp = (typeof aurora)[number];

/**
 * Darkening laid over gradient artwork before a glyph is drawn on it.
 *
 * The aurora ramps are mid-tone by design, so white text on the lighter ones
 * (the amber and cyan ramps especially) lands around 1.4:1 — effectively
 * invisible. This scrim brings the worst case back above 3:1 while leaving the
 * ramps saturated enough to still read as colour.
 */
export const artworkScrim = "rgba(0, 0, 0, 0.34)";

/** Soft elevation ramp. Glass panels use `panel`; floating controls use `float`. */
export const elevation = {
  none: {},
  panel: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 6,
  },
  float: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 34,
    elevation: 12,
  },
  /** The play button — a coloured glow, not a grey drop shadow. */
  glow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 10,
  },
} as const;

/** Blur strength for frosted panels. */
export const blur = {
  thin: 22,
  regular: 38,
  thick: 60,
} as const;

export const layout = {
  /** Bottom padding reserved for the tab bar so content can scroll clear of it. */
  tabBarInset: Platform.select({ ios: 52, android: 84 }) ?? 64,
  /** Height of the collapsed mini-player. */
  miniPlayerHeight: 66,
  /** Floating margin around the mini-player / collapsed sheet. */
  floatInset: 12,
  maxContentWidth: 760,
} as const;

/** Glass fill helper — keeps alpha decisions in one place. */
export function glassFill(scheme: ColorScheme, strong = false): ColorValue {
  return strong ? colors[scheme].glassStrong : colors[scheme].glass;
}
