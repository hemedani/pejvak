/**
 * Pejvak design tokens — the single source of truth for the visual language.
 *
 * The look: clean, calm, calm-toned. A soft neutral canvas, **opaque** tonal
 * cards sitting clearly above it, one saturated accent per theme, and a small
 * family of "aurora" gradient pairs that give every track its own colour
 * identity on the now-playing canvas.
 *
 * Anything that a screen needs to make a visual decision should come from here
 * (or from `motion.ts`), never from an inline literal.
 *
 * ## Two materials, not one
 *
 * The app has exactly two surface materials, and which one a thing gets is not
 * a matter of taste:
 *
 *   · **Opaque tonal (`surface`, `surfaceSunken`)** — anything the user *reads*.
 *     Every card, row, tile, stat and list row. Opaque because a frosted panel
 *     over a near-white canvas measured 1.04:1 against its own hairline: the
 *     text stayed technically legible while the card stopped being a shape, and
 *     a hierarchy nobody can see is not a hierarchy.
 *   · **Glass (`glass`, `glassStrong`)** — anything that *floats*. The tab bar,
 *     the mini-player, sheets, menus, the search field. Glass is only worth its
 *     cost when there is something moving behind it.
 *
 * `GlassSurface` renders the second; `Card` (in `@/components/ui/card`) renders
 * the first. Reaching for glass on a content card is the mistake this split
 * exists to prevent.
 *
 * ## The content hierarchy
 *
 * Every card, row and stat obeys the same three tiers, in this order. A screen
 * that inverts them — a 13px grey label beside a 16px bold value — reads as
 * mush no matter how good the colours are.
 *
 * | Tier | Carries | Type | Colour |
 * |---|---|---|---|
 * | Primary | the label, the title, the name | `body` / `title` / `heading` | `text` |
 * | Secondary | the value, the figure, the count | `body` / `numeric` / `figure` | `textSecondary` |
 * | Tertiary | supporting detail, units, hints | `caption` | `textTertiary` |
 *
 * The accent is for *state and action* — a progress fill, a selected control, a
 * live figure — never for making text louder than its neighbours.
 *
 * ## One shape ramp
 *
 * `radius` is a single strictly-increasing, even-numbered ramp, with a handful
 * of semantic aliases pointing into it. No component hard-codes a corner.
 */

import { StyleSheet, type ColorValue, type TextStyle } from "react-native";

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

/**
 * The shape ramp. Even numbers only, strictly increasing — a 1px difference
 * between two neighbouring cards is what makes a screen look assembled rather
 * than designed.
 *
 * The semantic aliases below are *names for steps of this ramp*, not new values,
 * so a caller can say `radius.badge` and still be inside the lock.
 */
export const radius = {
  /** Count badge, the smallest chip. */
  xs: 8,
  /** Artwork tile, icon badge. */
  sm: 12,
  /** Inline control, menu row, text field. */
  md: 16,
  /** Inset row, segmented-control track. */
  lg: 20,
  /** The card. One value, every card. */
  card: 28,
  /** Collapsed sheet. */
  xl: 32,
  /** Expanded sheet, hero panel. */
  xxl: 40,
  /** Alias — artwork tile. */
  tile: 12,
  /** Alias — the leading glyph badge on a settings row. */
  badge: 12,
  /** Alias — the track a segmented control sits in. */
  segment: 20,
  /** Alias — floating chrome: tab bar, mini-player, action menu. */
  panel: 28,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

/**
 * Type scale. Display sizes carry negative tracking so large text stays tight
 * and premium rather than airy; small sizes get slight positive tracking.
 *
 * `figure` and `numeric` are tabular: anything that counts, times or prices must
 * not reflow as its digits change. A stat grid whose numbers jitter sideways
 * every second is unreadable at a glance.
 */
export const typeScale = {
  hero: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    letterSpacing: -1.1,
  },
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  /** A card's headline number — larger than the title, and tighter with it. */
  figure: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", letterSpacing: 0 },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0.05,
  },
  /** All-caps eyebrow above a section title. */
  overline: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  /** Tabular readout for time codes and counts. */
  numeric: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typeScale;

export type SemanticColors = {
  /** Page background. */
  canvas: string;
  /** A step up from the canvas, for the layer behind a floating surface. */
  canvasElevated: string;
  /**
   * Opaque card fill. The colour every piece of content sits on, and the reason
   * a card reads as a card — it must stay clearly lighter than `canvas` in light
   * and clearly lighter still in dark.
   */
  surface: string;
  /** A step *below* `surface`: a segmented-control track, an inset row. */
  surfaceSunken: string;
  /** The hairline around a card. Carries meaning, so it is held to 3:1. */
  outline: string;
  /** A row divider inside a card. Structure, not a boundary — held below 3:1. */
  outlineVariant: string;
  /** Translucent fill for a *floating* frosted panel. */
  glass: string;
  /** More opaque frosted fill, for floating panels over busy art. */
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
  /** Accent at low alpha, for selected controls and washes. */
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
  canvas: "#E4E9EF",
  canvasElevated: "#EDF1F6",
  surface: "#FFFFFF",
  surfaceSunken: "#EDF1F6",
  outline: "#B4C0CC",
  outlineVariant: "#DCE3EA",
  /** Translucent fill for a *floating* frosted panel. */
  glass: "rgba(255, 255, 255, 0.78)",
  /** More opaque frosted fill, for floating panels over busy art. */
  glassStrong: "rgba(255, 255, 255, 0.92)",
  /**
   * The hairline around a *floating* panel.
   *
   * Dark, not white. A white border on a near-white fill measured **1.00:1**
   * against its own fill — literally invisible — which left the tab bar and the
   * mini-player with no edge at all once the cards underneath them went opaque.
   * The bright highlight on a floating panel is `glassHighlight`, and it belongs
   * on the top edge only; a panel's outline is a shadow line.
   */
  glassBorder: "rgba(20, 32, 39, 0.13)",
  /** Top specular edge — the "wet" highlight that sells the glass. */
  glassHighlight: "rgba(255, 255, 255, 0.95)",
  shadow: "rgba(20, 32, 39, 0.16)",
  text: "#0E1720",
  textSecondary: "#41505A",
  textTertiary: "#5B6A75",
  accent: "#0A635C",
  accentSoft: "rgba(10, 99, 92, 0.12)",
  onAccent: "#FFFFFF",
  danger: "#B02F45",
  scrim: "rgba(12, 18, 24, 0.38)",
  track: "rgba(65, 80, 90, 0.18)",
  icon: "#2C3A43",
};

const dark: SemanticColors = {
  canvas: "#060910",
  canvasElevated: "#0E1520",
  surface: "#1A2330",
  surfaceSunken: "#222D3A",
  outline: "#4C5B68",
  outlineVariant: "#2E3A46",
  glass: "rgba(28, 37, 50, 0.72)",
  glassStrong: "rgba(30, 40, 54, 0.9)",
  glassBorder: "rgba(226, 238, 255, 0.22)",
  glassHighlight: "rgba(255, 255, 255, 0.24)",
  shadow: "rgba(0, 0, 0, 0.55)",
  text: "#F0F5F4",
  textSecondary: "#B4C4CB",
  textTertiary: "#8B9EA8",
  accent: "#5FD9C6",
  accentSoft: "rgba(95, 217, 198, 0.16)",
  onAccent: "#04231F",
  danger: "#FF8296",
  scrim: "rgba(0, 0, 0, 0.58)",
  track: "rgba(180, 196, 203, 0.2)",
  icon: "#D6E2E6",
};

export const colors: Record<ColorScheme, SemanticColors> = { light, dark };

/**
 * Aurora gradient pairs. Each track resolves deterministically to one of these,
 * which becomes its canvas background and accent glow. Two stops each, tuned to
 * stay behind text without washing it out.
 */
export const aurora: readonly (readonly [string, string, string])[] = [
  ["#0A635C", "#1FB6A6", "#0B4F52"],
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

/**
 * Soft elevation ramp. Shadows here are *elevation logic*, not decoration —
 * three levels, and a thing that has one is a thing sitting above the page.
 *
 * `card` is deliberately the shallowest. An opaque card sitting on a canvas
 * already 1.22:1 above it does not need a deep drop shadow; a heavy one reads
 * as a dialog and flattens the hierarchy between a card and the thing on it.
 */
export const elevation = {
  none: {},
  /** An opaque content card. */
  card: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  /** A floating frosted panel. */
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
  /**
   * The dock.
   *
   * Much shallower than `float`, and deliberately so. A floating *control* is
   * lifted off the page, but a dock is a **surface** — it holds the navigation
   * and the now-playing row, and both of those already have their own contrast
   * against the canvas. The deep drop it inherited from `float` read as the dock
   * hovering over the screen rather than floating *in* it, and darkened the
   * canvas along the bottom edge of every list in the app.
   */
  dock: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 5,
  },
  /** The play button — a coloured glow, not a grey drop shadow. */
  glow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 10,
  },
} as const;

/**
 * Inside a card. One padding for every content surface, so two cards' content
 * starts at the same x no matter which component drew them.
 *
 * `rowPadding` is the one deliberate exception, and it exists because a card in
 * a dense list is a *row*, not a panel: it has to stay scannable at fifty to a
 * page. It is a token rather than a per-component `spacing.md` so the exception
 * is visible instead of drifting back into every file.
 */
export const card = {
  /** Padding around a standalone card's content. */
  padding: spacing.lg,
  /** Padding inside a card used as a list row. */
  rowPadding: spacing.md,
  /** Vertical padding for a row inside a group — the 44pt tap-target floor. */
  rowMinHeight: 52,
  /** The leading glyph badge on a settings row. */
  badge: 36,
  badgeIcon: 19,
  /** Height of a segmented control's track. */
  segmentHeight: 44,
  /** Hairline between rows in a group. */
  dividerInset: spacing.lg + 36 + spacing.md,
} as const;

/** Blur strength for frosted panels. */
export const blur = {
  thin: 22,
  regular: 38,
  thick: 60,
} as const;

export const layout = {
  maxContentWidth: 760,
  /**
   * The floating dock — one rounded panel that holds the now-playing row *and*
   * the navigation.
   *
   * ## Why they are one object
   *
   * They used to be two absolutely-positioned panels, which made the geometry a
   * negotiation: the bar's centre button overhung its own top edge by 22pt, and
   * the mini-player sat a fixed 80pt up from the screen bottom. The bar claimed
   * those 22pt back — so the two overlapped by 32pt, and the raised button ended
   * up underneath the now-playing row. The clearance token even documented
   * itself as "mirrors the bar's own geometry so the two can never overlap",
   * which was simply false: it mirrored the bar's *height* and none of its
   * overhang.
   *
   * Inside one panel the question cannot be asked. The two halves share a
   * surface, a radius and a shadow, so there is no clearance to get wrong, and
   * the stack reads as a single deliberate object instead of two panels arguing
   * over 32pt.
   */
  dock: {
    /**
     * Both halves, and the same height.
     *
     * The now-playing row and the navigation row are equal, so the seam between
     * them divides the panel in half rather than cutting a tall nav off a short
     * player.
     */
    playerHeight: 58,
    navHeight: 58,
    /**
     * The selected destination's indicator — a **circle**, not a chip.
     *
     * It was a 44×30 pill, which with a pill radius is a lozenge: it reads as a
     * filter tag rather than as the button the listener is currently on. A true
     * circle says *here* far more directly, and an even diameter means its
     * radius is exactly half and lands on a whole pixel.
     *
     * Sized to fit in a 58pt row with ~9pt above and below, and to leave ~13pt
     * between it and the next slot's icon.
     */
    indicator: 40,
    /** The resting glyph, in an empty slot. */
    icon: 22,
    /**
     * The selected glyph, knocked out of the accent circle.
     *
     * Slightly larger than the resting glyph because it now has a background to
     * sit on and needs the extra weight to read at the same size, and still a
     * half of the circle — the same proportion as the now-playing row's play
     * button, which is what makes the two halves rhyme.
     */
    iconActive: 20,
    /**
     * Minimum tap target. A slot is the whole column, so this is the short edge
     * of every destination's touch area.
     */
    touchTarget: 44,
    /** Gap from the safe-area edge to the dock's bottom. */
    margin: 10,
    /** Horizontal float. */
    inset: 12,
    /** Room below the dock that content needs so nothing rests against it. */
    clearance: 20,
  },
} as const;

/**
 * How much bottom padding a screen owes the dock.
 *
 * Sized for the dock at its **tallest** — player plus navigation — because a
 * screen cannot know whether something is playing, and reserving for the short
 * case would let the last row of a library list hide behind the now-playing row.
 * The extra space when nothing is playing is the price of never guessing.
 */
export const dockInset =
  layout.dock.margin +
  layout.dock.playerHeight +
  layout.dock.navHeight +
  layout.dock.clearance;

/** Glass fill helper — keeps alpha decisions in one place. */
export function glassFill(scheme: ColorScheme, strong = false): ColorValue {
  return strong ? colors[scheme].glassStrong : colors[scheme].glass;
}
