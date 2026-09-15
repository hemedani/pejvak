/**
 * Ambient accent wash.
 *
 * Two slow-drifting radial glows tinted by the current track's palette, sitting
 * behind a screen's content. This is what stops the glass panels from reading as
 * flat grey: the blur always has colour moving underneath it.
 *
 * The drift is a single 9-second eased loop, mirrored. It is deliberately slow
 * enough that you notice it only if you look for it.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { withAlpha } from "@/lib/palette";
import { duration, easing, useMotionEnabled } from "@/theme/motion";

export type AmbientWashProps = {
  /** Accent colour the glows are tinted with. */
  color: string;
  /** 0–1 multiplier on the glow alpha. */
  intensity?: number;
};

export function AmbientWash({ color, intensity = 1 }: AmbientWashProps) {
  const motionEnabled = useMotionEnabled();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!motionEnabled) {
      drift.value = 0.5;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: duration.ambient, easing: easing.inOutSoft }),
      -1,
      true,
    );
  }, [drift, motionEnabled]);

  const topLeft = useAnimatedStyle(() => ({
    transform: [
      { translateX: -34 + drift.value * 44 },
      { translateY: -26 + drift.value * 52 },
      { scale: 1 + drift.value * 0.09 },
    ],
  }));

  const bottomRight = useAnimatedStyle(() => ({
    transform: [
      { translateX: 28 - drift.value * 52 },
      { translateY: 38 - drift.value * 62 },
      { scale: 1.06 - drift.value * 0.07 },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.blob, styles.topLeft, topLeft]}>
        <LinearGradient
          colors={[withAlpha(color, 0.34 * intensity), withAlpha(color, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.bottomRight, bottomRight]}>
        <LinearGradient
          colors={[withAlpha(color, 0.26 * intensity), withAlpha(color, 0)]}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.fill}
        />
      </Animated.View>
    </View>
  );
}

const SIZE = 460;

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: "hidden",
  },
  topLeft: {
    top: -170,
    left: -150,
  },
  bottomRight: {
    bottom: -190,
    right: -160,
  },
  fill: {
    flex: 1,
  },
});
