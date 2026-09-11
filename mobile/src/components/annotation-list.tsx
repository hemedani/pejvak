import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";

export type AnnotationListProps = {
  annotations: LocalAnnotation[];
  selectedId: string | null;
  onSelect: (annotation: LocalAnnotation) => void;
};

export function AnnotationList({ annotations, selectedId, onSelect }: AnnotationListProps) {
  const theme = useTheme();

  if (annotations.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
        No notes yet. Tap “+ Note” to add one at the current position.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {annotations.map((annotation) => {
        const selected = annotation.id === selectedId;
        return (
          <Pressable
            key={annotation.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(annotation)}>
            <ThemedView
              type={selected ? "backgroundSelected" : "backgroundElement"}
              style={styles.row}>
              <View
                style={[styles.dot, { backgroundColor: annotation.color ?? theme.tint }]}
              />
              <View style={styles.body}>
                <ThemedText type="smallBold">{formatClock(annotation.positionSec)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {annotation.text}
                </ThemedText>
              </View>
            </ThemedView>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
});
