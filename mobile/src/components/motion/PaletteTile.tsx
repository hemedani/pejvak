/**
 * A square gradient tile standing in for artwork.
 *
 * Cheap enough for list rows (one `LinearGradient`, no shared values) where the
 * cross-fading `CrossfadeArtwork` would be overkill.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { artworkScrim, type AuroraRamp } from "@/theme/tokens";

export type PaletteTileProps = {
  ramp: AuroraRamp;
  /** Text the tile takes its initial from. */
  label?: string | null;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function PaletteTile({ ramp, label, size, radius = 14, style }: PaletteTileProps) {
  const initial = label?.trim().charAt(0).toUpperCase() ?? "";

  return (
    <LinearGradient
      colors={ramp}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}>
      {/* Scrim sits under the glyph and over the gradient, so the initial
          stays legible on the pale ramps. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
      {initial ? (
        <ThemedText style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
          {initial}
        </ThemedText>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  scrim: {
    backgroundColor: artworkScrim,
  },
  initial: {
    color: "rgba(255,255,255,0.94)",
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
