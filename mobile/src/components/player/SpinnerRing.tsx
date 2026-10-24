/**
 * The player's wait, drawn as motion.
 *
 * A ring rather than a glyph, and inside the control rather than beside it: the
 * play button has to *stay* a button while the player is fetching, because
 * tapping it is how the listener stops waiting. A spinner that replaced the
 * control would take away the only thing they can do about it.
 *
 * Two rings, like every progress indicator worth reading: a faint full circle
 * saying "this is a dial", and a bright half-arc turning on it saying "it is
 * still turning". One arc alone reads as a broken circle; a full bright ring
 * reads as a state, not an action.
 *
 * It stops the instant the wait does — `spinning` is only true while the player
 * is waiting — so this is not the ambient loop the motion rules are about.
 */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { easing, useMotionEnabled } from "@/theme/motion";

/** One revolution. Slow enough to read as patience, not as a progress bar. */
const SPIN_MS = 900;
/** The unlit ring, as a share of the lit arc's alpha. */
const TRACK_OPACITY = 0.24;

export type SpinnerRingProps = {
  /** Outer diameter, in points. */
  size?: number;
  thickness?: number;
  /** The lit arc — normally the accent, or `onAccent` on a filled control. */
  color: string;
  /** The unlit ring. Defaults to `color` at low alpha. */
  trackColor?: string;
};

export function SpinnerRing({
  size = 26,
  thickness = 2.5,
  color,
  trackColor,
}: SpinnerRingProps) {
  const motionEnabled = useMotionEnabled();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!motionEnabled) {
      // Reduced motion still has to say "working". A static half-arc next to
      // the status line's words does that without moving anything.
      spin.value = 0;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(360, {
        duration: SPIN_MS,
        easing: easing.linear,
        // `useMotionEnabled()` is the authority — the same reason `springSpec`
        // refuses to let Reanimated re-apply the OS setting.
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
    );
  }, [motionEnabled, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const ring = { borderRadius: size / 2, borderWidth: thickness };

  return (
    <View
      pointerEvents="none"
      // Decorative: the control around it carries the label, and a second
      // accessibility node inside a button is noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}>
      <View
        style={[
          styles.fill,
          ring,
          { borderColor: trackColor ?? color, opacity: trackColor ? 1 : TRACK_OPACITY },
        ]}
      />
      <Animated.View
        style={[
          styles.fill,
          ring,
          { borderColor: "transparent", borderTopColor: color, borderRightColor: color },
          spinStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
