/**
 * Album artwork with a flicker-free cross-fade.
 *
 * When the track changes we do NOT swap the image. The outgoing artwork stays
 * mounted at full opacity while the incoming one fades in over 400 ms from a
 * 6% oversize (the "zoom-out" settle), so there is never a frame with nothing
 * on screen.
 *
 * Skipping also gives the whole tile a small organic kick — a few degrees of
 * rotation and a touch of scale — driven by `skipNonce`, so next/previous feel
 * like they physically moved the record.
 */

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useCrossfade } from "@/components/motion/use-crossfade";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { duration, easing, spring } from "@/theme/motion";
import { artworkScrim, type AuroraRamp } from "@/theme/tokens";

export type CrossfadeArtworkProps = {
  /** Artwork URI, or null/undefined to render the palette tile. */
  source?: string | null;
  /** Palette for the fallback tile. */
  ramp: AuroraRamp;
  /** Text the fallback tile takes its initial from. */
  label?: string | null;
  radius?: number;
  /** Bumping this (with `skipDirection`) triggers the skip kick. */
  skipNonce?: number;
  skipDirection?: 1 | -1;
  style?: StyleProp<ViewStyle>;
};

/** Zoom the incoming artwork settles out of. */
const ENTER_SCALE = 1.06;
/** Degrees of rotation on a skip. */
const KICK_ROTATION = 5;

export function CrossfadeArtwork({
  source,
  ramp,
  label,
  radius = 28,
  skipNonce,
  skipDirection = 1,
  style,
}: CrossfadeArtworkProps) {
  // `""` rather than `null` so the cross-fade value is always a string and a
  // `null` previous layer unambiguously means "there is no outgoing layer".
  const { current, previous, progress } = useCrossfade(source ?? "");

  const rotate = useSharedValue(0);
  const kick = useSharedValue(1);
  const lastNonce = useRef(skipNonce);

  useEffect(() => {
    if (skipNonce === undefined || skipNonce === lastNonce.current) {
      return;
    }
    lastNonce.current = skipNonce;

    rotate.value = withSequence(
      withTiming(KICK_ROTATION * skipDirection, {
        duration: duration.quick,
        easing: easing.outQuint,
      }),
      withSpring(0, spring.gentle),
    );
    kick.value = withSequence(
      withTiming(1.035, { duration: duration.quick, easing: easing.outQuint }),
      withSpring(1, spring.gentle),
    );
  }, [kick, rotate, skipDirection, skipNonce]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }, { scale: kick.value }],
  }));

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const incomingStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: ENTER_SCALE - (ENTER_SCALE - 1) * progress.value }],
  }));

  const renderLayer = (value: string, which: "previous" | "current") => (
    <Animated.View
      key={which}
      style={[StyleSheet.absoluteFill, which === "previous" ? outgoingStyle : incomingStyle]}>
      {value ? (
        <Image
          source={{ uri: value }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // The cross-fade is ours; expo-image's own transition would fight it
          // and produce a visible double-fade.
          transition={0}
        />
      ) : (
        <LinearGradient
          colors={ramp}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}>
          {/* Scrim sits under the glyph and over the gradient, so the initial
              stays legible on the pale ramps. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
          {label ? (
            <ThemedText style={styles.initial}>{label.trim().charAt(0).toUpperCase()}</ThemedText>
          ) : (
            <Icon name="music" size={44} color="rgba(255,255,255,0.95)" />
          )}
        </LinearGradient>
      )}
    </Animated.View>
  );

  return (
    <Animated.View style={[styles.container, { borderRadius: radius }, style, containerStyle]}>
      {previous !== null ? renderLayer(previous, "previous") : null}
      {renderLayer(current, "current")}
      {/* Inner specular edge — sells the tile as a physical object. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  fill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: {
    backgroundColor: artworkScrim,
  },
  initial: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 64,
    lineHeight: 72,
    fontWeight: "700",
    letterSpacing: -2,
  },
});
