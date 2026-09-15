/**
 * The dynamic canvas.
 *
 * A full-bleed gradient painted from the current track's palette. Changing track
 * cross-fades the whole canvas over 400 ms rather than swapping it, and a
 * theme-aware scrim keeps text legible on top in both light and dark mode.
 *
 * `ramp` must be a stable reference (use `paletteFor` from `@/lib/palette`),
 * because the cross-fade keys off reference identity to decide whether anything
 * actually changed.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { useCrossfade } from "@/components/motion/use-crossfade";
import { useScheme } from "@/hooks/use-theme";
import type { AuroraRamp } from "@/theme/tokens";
import { colors } from "@/theme/tokens";

export type DynamicCanvasProps = {
  ramp: AuroraRamp;
  /** Flat wash of the canvas colour over the gradient. Higher = calmer. */
  scrim?: number;
  /** Extra opacity at the very bottom, so controls sit on solid colour. */
  bottomScrim?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function DynamicCanvas({
  ramp,
  scrim = 0.28,
  bottomScrim = 0.82,
  style,
  children,
}: DynamicCanvasProps) {
  const scheme = useScheme();
  const canvas = colors[scheme].canvas;
  const { current, previous, progress } = useCrossfade(ramp);

  const incoming = useAnimatedStyle(() => ({ opacity: progress.value }));
  const outgoing = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  const layer = (value: AuroraRamp, which: "previous" | "current") => (
    <Animated.View
      key={which}
      style={[StyleSheet.absoluteFill, which === "previous" ? outgoing : incoming]}>
      <LinearGradient
        colors={value}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {previous ? layer(previous, "previous") : null}
      {layer(current, "current")}

      {/* Theme-aware wash: lightens in light mode, deepens in dark mode. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas, opacity: scrim }]} />

      {/* Bottom anchor so transport controls always sit on solid colour. */}
      <LinearGradient
        colors={["transparent", canvas]}
        locations={[0.35, 1]}
        style={[StyleSheet.absoluteFill, { opacity: bottomScrim }]}
      />

      {children}
    </View>
  );
}
