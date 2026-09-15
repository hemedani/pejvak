/**
 * Progress track with a spring-driven fill.
 *
 * The fill is animated rather than snapped, so seeking and scrubbing glide into
 * place instead of teleporting. `children` are rendered on top of the track for
 * the player's annotation markers.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useEffect } from "react";

import { withAlpha } from "@/lib/palette";
import { spring } from "@/theme/motion";
import { radius as radii } from "@/theme/tokens";

export type GlassProgressProps = {
  /** 0–1. */
  progress: number;
  tint: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Track thickness. */
  thickness?: number;
};

export function GlassProgress({
  progress,
  tint,
  children,
  style,
  thickness = 6,
}: GlassProgressProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const value = useSharedValue(clamped);

  useEffect(() => {
    value.value = withSpring(clamped, spring.snappy);
  }, [clamped, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${value.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height: thickness, borderRadius: thickness / 2 },
        style,
      ]}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: tint, borderRadius: thickness / 2, shadowColor: tint },
          fillStyle,
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: withAlpha("#7F8999", 0.24),
    position: "relative",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 3,
    borderRadius: radii.pill,
  },
});
