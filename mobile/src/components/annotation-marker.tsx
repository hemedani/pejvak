import { useEffect } from "react";
import { Pressable, StyleSheet, type DimensionValue } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";
import { markerOffsetRatio } from "@/lib/annotations";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";
import { spring, useMotionEnabled } from "@/theme/motion";

export type AnnotationMarkerProps = {
  annotation: LocalAnnotation;
  durationSec: number;
  selected: boolean;
  onPress: (annotation: LocalAnnotation) => void;
};

/** Colored tick on the player progress bar; tapping it seeks to the note. */
export function AnnotationMarker({
  annotation,
  durationSec,
  selected,
  onPress,
}: AnnotationMarkerProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const left = `${markerOffsetRatio(annotation.positionSec, durationSec) * 100}%` as DimensionValue;
  const emphasis = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    emphasis.value = motionEnabled
      ? withSpring(selected ? 1 : 0, spring.marker)
      : selected
        ? 1
        : 0;
  }, [emphasis, motionEnabled, selected]);

  // Scale from the marker's own centre rather than animating `left`: the
  // position is a percentage of the track and must not be recomputed per frame.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2 * emphasis.value },
      { scale: 1 + 0.25 * emphasis.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.marker,
        { left, backgroundColor: annotation.color ?? theme.tint },
        animatedStyle,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Note at ${formatClock(annotation.positionSec)}: ${annotation.text}`}
        hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
        onPress={() => onPress(annotation)}
        style={styles.hit}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: "absolute",
    top: -4,
    marginLeft: -2,
    width: 4,
    height: 14,
    borderRadius: 2,
  },
  hit: {
    flex: 1,
    borderRadius: 2,
  },
});
