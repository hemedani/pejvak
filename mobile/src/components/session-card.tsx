import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { describeSpeed, formatDuration, formatTimeRange, type HistoryItem } from "@/lib/history";

export type SessionCardProps = {
  item: HistoryItem;
  onPress?: (item: HistoryItem) => void;
};

function outcomeLabel(item: HistoryItem): string | null {
  if (item.session.completed) {
    return "Finished";
  }
  if (item.session.interrupted) {
    return "Interrupted";
  }
  return null;
}

export function SessionCard({ item, onPress }: SessionCardProps) {
  const outcome = outcomeLabel(item);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress ? () => onPress(item) : undefined}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.main}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.track.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatTimeRange(item.session.startedAt, item.session.endedAt)}
          </ThemedText>
        </View>
        <View style={styles.meta}>
          <ThemedText type="smallBold">
            {formatDuration(item.session.durationListenedSec)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeSpeed(item.session.playbackSpeed)}
            {outcome ? ` · ${outcome}` : ""}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  main: {
    flex: 1,
    gap: Spacing.half,
  },
  meta: {
    alignItems: "flex-end",
    gap: Spacing.half,
  },
});
