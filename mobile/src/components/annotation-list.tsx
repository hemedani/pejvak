import { StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";
import { spacing } from "@/theme/tokens";

export type AnnotationListProps = {
  annotations: LocalAnnotation[];
  selectedId?: string | null;
  onSelect?: (annotation: LocalAnnotation) => void;
};

export function AnnotationList({ annotations, selectedId = null, onSelect }: AnnotationListProps) {
  const theme = useTheme();

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
          <Reveal key={annotation.id} index={index} from="below">
            <ElasticPressable
              accessibilityRole={onSelect ? "button" : undefined}
              accessibilityState={{ selected }}
              haptic="selection"
              onPress={onSelect ? () => onSelect(annotation) : undefined}
              style={styles.pressable}>
              <GlassSurface
                flat
                tone={selected ? "surfaceStrong" : "surface"}
                style={[styles.row, selected && { borderColor: dotColor }]}>
                <View style={[styles.dot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
                <View style={styles.body}>
                  <ThemedText type="numeric" style={{ color: dotColor }}>
                    {formatClock(annotation.positionSec)}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
                    {annotation.text}
                  </ThemedText>
                </View>
              </GlassSurface>
            </ElasticPressable>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  pressable: {
    borderRadius: 20,
  },
  empty: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
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
