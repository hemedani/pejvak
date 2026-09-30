/**
 * The card — the app's content surface.
 *
 * ## Why this exists next to `GlassSurface`
 *
 * There are exactly two surface materials, and which one a thing gets is not a
 * matter of taste:
 *
 *   · **Opaque tonal** (`Card`) — anything the user *reads*. Every card, row,
 *     tile, stat and list row.
 *   · **Frosted glass** (`GlassSurface`) — anything that *floats*. The tab bar,
 *     the mini-player, sheets, menus, the search field.
 *
 * A frosted panel over a near-white canvas measured **1.04:1 against its own
 * hairline**: the text stayed technically legible while the card stopped being a
 * shape. A hierarchy nobody can see is not a hierarchy, so content moved here
 * and stayed there.
 *
 * ## What makes it read as a card
 *
 * Three things, and all three are load-bearing:
 *
 *   1. **A fill that clears the canvas** — `surface` sits measurably above
 *      `canvas` in both themes (see `theme/__tests__/tokens.test.ts`).
 *   2. **A hairline you can see** — `outline`, held to a real contrast ratio
 *      rather than left as a `rgba(255,255,255,0.7)` that vanishes on a light
 *      fill.
 *   3. **A shallow shadow** — `elevation.card`, deliberately the smallest in the
 *      ramp. An opaque card on a raised canvas does not need a deep drop; a
 *      heavy one reads as a dialog and flattens the hierarchy between the card
 *      and the thing on it.
 *
 * ## The one exception
 *
 * `wash` lays a colour over an *opaque* fill, and it is the reason a library of
 * three thousand files is a wall of colour rather than a wall of white. It is
 * kept far below the alpha a glass card needed, because here it sits on top of
 * a solid fill instead of tinting a blur: at the old strength it drowned the
 * text it was supposed to sit behind.
 *
 * ## Elevation is a decision, not a default
 *
 * `elevated` defaults to true for a standalone card and should be turned *off*
 * for a card inside a long list. Fifty elevated cards on one screen stop reading
 * as cards and start reading as noise; in a dense list the `surface` fill and
 * the `outline` hairline are already enough to draw the edge, and the shadow
 * only competes with the content. A focal card — a stat in a four-tile grid —
 * keeps it.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useScheme, useTheme } from "@/hooks/use-theme";
import { withAlpha } from "@/lib/palette";
import { card as cardTokens, elevation, hairline, radius as radii } from "@/theme/tokens";

export type CardVariant = "card" | "inset";

export type CardProps = {
  children?: ReactNode;
  /**
   * `card` is a content card. `inset` is a step *below* one — a segmented
   * control's track, a nested strip. It has no shadow, because it does not sit
   * above the page; it sits inside something that already does.
   */
  variant?: CardVariant;
  /** Colour bled over the top-left of the card. The item's own identity. */
  wash?: string | null;
  /** Draw the hairline. Off when the card is nested inside another card. */
  bordered?: boolean;
  /** Cast the card shadow. Turn off inside a long list — see the file header. */
  elevated?: boolean;
  /** Clip children to the radius — required when `wash` is set. */
  clip?: boolean;
  /** Padding. Defaults to the one card padding, so cards align with each other. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant = "card",
  wash,
  bordered = true,
  elevated = variant === "card",
  clip,
  padded = true,
  style,
}: CardProps) {
  const theme = useTheme();
  const scheme = useScheme();
  const sunken = variant === "inset";

  // The wash sits on a solid fill rather than tinting a blur, so it needs far
  // less of itself: it is decoration behind text, not a surface behind text.
  const washAlpha = scheme === "dark" ? 0.16 : 0.1;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: sunken ? theme.surfaceSunken : theme.surface,
          borderRadius: sunken ? radii.lg : radii.card,
          borderWidth: bordered ? hairline : 0,
          borderColor: sunken ? theme.outlineVariant : theme.outline,
        },
        elevated && !sunken
          ? { ...elevation.card, shadowColor: theme.shadow }
          : null,
        padded && !sunken ? styles.padded : null,
        clip || wash ? { overflow: "hidden" } : null,
        style,
      ]}>
      {wash ? (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(wash, washAlpha), withAlpha(wash, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: "relative",
  },
  padded: {
    padding: cardTokens.padding,
  },
});
