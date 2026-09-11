import { Pressable, StyleSheet, type DimensionValue } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { markerOffsetRatio } from "@/lib/annotations";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";

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
  const left = `${markerOffsetRatio(annotation.positionSec, durationSec) * 100}%` as DimensionValue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Note at ${formatClock(annotation.positionSec)}: ${annotation.text}`}
      hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
      onPress={() => onPress(annotation)}
      style={[
        styles.marker,
        selected && styles.markerSelected,
        { left, backgroundColor: annotation.color ?? theme.tint },
      ]}
    />
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
  markerSelected: {
    top: -6,
    marginLeft: -3,
    width: 6,
    height: 18,
    borderRadius: 3,
  },
});
