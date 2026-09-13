import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, RefreshControl, SectionList, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SessionCard } from "@/components/session-card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useHistory } from "@/hooks/use-history";
import { historyToMarkdown } from "@/lib/exportHistory";
import { groupSessionsByDay, type HistoryItem } from "@/lib/history";

type HistorySection = {
  key: string;
  title: string;
  data: HistoryItem[];
};

export default function HistoryScreen() {
  const { items, loading, refresh } = useHistory();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const sections = useMemo<HistorySection[]>(
    () =>
      groupSessionsByDay(items).map((day) => ({
        key: day.key,
        title: day.label,
        data: day.items,
      })),
    [items],
  );

  const exportHistory = async () => {
    try {
      await Share.share({
        title: "Listening history",
        message: historyToMarkdown(items),
      });
    } catch {
      // The share sheet was dismissed or sharing is unavailable.
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">History</ThemedText>
          {items.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export listening history"
              hitSlop={8}
              onPress={() => void exportHistory()}>
              <ThemedText type="linkPrimary">Export</ThemedText>
            </Pressable>
          ) : null}
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.session.id}
          renderItem={({ item }) => <SessionCard item={item} />}
          renderSectionHeader={({ section }) => (
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
          }
          ListEmptyComponent={
            loading ? null : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No listening yet. Play a track and your sessions will show up here.
              </ThemedText>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  sectionHeader: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.five,
  },
});
