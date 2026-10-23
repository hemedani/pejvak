import { StyleSheet, View } from "react-native";
import Animated, {
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/hooks/use-theme";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";
import { duration, useMotionEnabled } from "@/theme/motion";
import { card as cardTokens, spacing } from "@/theme/tokens";

export type AnnotationListProps = {
  annotations: LocalAnnotation[];
  selectedId?: string | null;
  onSelect?: (annotation: LocalAnnotation) => void;
};

export function AnnotationList({ annotations, selectedId = null, onSelect }: AnnotationListProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();

  if (annotations.length === 0) {
    return (
      <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
        No notes yet. Tap “Note” to capture the moment.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {annotations.map((annotation, index) => {
        const selected = annotation.id === selectedId;
        const dotColor = annotation.color ?? theme.accent;

        return (
          <Animated.View
            key={annotation.id}
            layout={
              motionEnabled
                ? LinearTransition.reduceMotion(ReduceMotion.Never)
                : undefined
            }
            exiting={
              motionEnabled
                ? FadeOut.duration(duration.exit).reduceMotion(
                    ReduceMotion.Never,
                  )
                : undefined
            }>
            <Reveal index={index} from="below">
              <ElasticPressable
                accessibilityRole={onSelect ? "button" : undefined}
                accessibilityState={{ selected }}
                haptic="select"
                onPress={onSelect ? () => onSelect(annotation) : undefined}>
                {/* Selection is the border, not a different material: an opaque
                    card cannot go "stronger" the way a frosted one could, and a
                    tinted outline is a clearer signal anyway. */}
                <Card
                  elevated={false}
                  style={[styles.row, selected && { borderColor: dotColor }]}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: dotColor, shadowColor: dotColor },
                    ]}
                  />
                  <View style={styles.body}>
                    <ThemedText type="numeric" style={{ color: dotColor }}>
                      {formatClock(annotation.positionSec)}
                    </ThemedText>
                    <ThemedText
                      type="caption"
                      themeColor="textSecondary"
                      numberOfLines={2}>
                      {annotation.text}
                    </ThemedText>
                  </View>
                </Card>
              </ElasticPressable>
            </Reveal>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: cardTokens.padding,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
});
