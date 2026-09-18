/**
 * A square artwork tile for list rows.
 *
 * Shows the track's cover when there is one and a deterministic gradient with
 * the title's initial when there is not — which is the honest fallback, not a
 * placeholder: plenty of lecture recordings and old rips carry no picture at
 * all, and a library of identical grey boxes is worse than a library of colours.
 *
 * Cheap enough for a virtualised list: one `Image`, no shared values. The
 * cross-fading `CrossfadeArtwork` would be overkill here.
 */

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { artworkScrim, type AuroraRamp } from "@/theme/tokens";

export type PaletteTileProps = {
  ramp: AuroraRamp;
  /** Text the fallback tile takes its initial from. */
  label?: string | null;
  /** Cover art URI. Falls back to the gradient when absent or unreadable. */
  source?: string | null;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function PaletteTile({
  ramp,
  label,
  source,
  size,
  radius = 14,
  style,
}: PaletteTileProps) {
  // One failed URI, not a set: a new track brings a new URI, so the flag clears
  // itself on the next row without an effect to reset it.
  const [failed, setFailed] = useState<string | null>(null);
  const uri = source ?? null;
  const showArtwork = uri !== null && uri !== failed;
  const initial = label?.trim().charAt(0).toUpperCase() ?? "";

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}>
      <LinearGradient
        colors={ramp}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {showArtwork ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={140}
          // A file deleted behind the app's back must not leave a blank square.
          onError={() => setFailed(uri)}
        />
      ) : (
        <>
          {/* Scrim sits under the glyph and over the gradient, so the initial
              stays legible on the pale ramps. Over real artwork it would only
              dim the picture, so it is drawn on the fallback path alone. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
          {initial ? (
            <ThemedText style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
              {initial}
            </ThemedText>
          ) : null}
        </>
      )}
    </View>
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
