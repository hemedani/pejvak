import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useHistory } from "@/hooks/use-history";
import { formatDuration } from "@/lib/history";
import {
  computeDailyListen,
  computeDayStreak,
  computeListeningStats,
  computeTrackLeaders,
} from "@/lib/stats";

function formatDay(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatLastPlayed(value: number | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function StatsScreen() {
  const { items, loading, refresh } = useHistory();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const stats = computeListeningStats(items);
  const leaders = computeTrackLeaders(items, 5);
  const streak = computeDayStreak(items);
  const recentDays = computeDailyListen(items).slice(-7).reverse();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Stats</ThemedText>
          </View>

          {!loading && items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Play something and your listening stats will appear here.
            </ThemedText>
          ) : null}

          <View style={styles.grid}>
            <StatCell
              label="listened"
              value={formatDuration(stats.totalListenTimeSec)}
              style={styles.gridCell}
            />
            <StatCell label="sessions" value={String(stats.sessionCount)} style={styles.gridCell} />
            <StatCell label="tracks" value={String(stats.trackCount)} style={styles.gridCell} />
            <StatCell label="day streak" value={String(streak)} style={styles.gridCell} />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Most listened
            </ThemedText>
            {leaders.length > 0 ? (
              leaders.map((leader) => (
                <ThemedView key={leader.contentHash} type="backgroundElement" style={styles.row}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.rowTitle}>
                    {leader.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDuration(leader.listenTimeSec)} · {leader.playCount} play
                    {leader.playCount === 1 ? "" : "s"}
                  </ThemedText>
                </ThemedView>
              ))
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing yet.
              </ThemedText>
            )}
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Longest session
            </ThemedText>
            {stats.longestSessionTitle ? (
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.rowTitle}>
                  {stats.longestSessionTitle}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDuration(stats.longestSessionSec)}
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing yet.
              </ThemedText>
            )}
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Recent days
            </ThemedText>
            {recentDays.length > 0 ? (
              recentDays.map((day) => (
                <View key={day.key} style={styles.dayRow}>
                  <ThemedText type="small">{formatDay(day.key)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDuration(day.listenTimeSec)}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing yet.
              </ThemedText>
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Last played: {formatLastPlayed(stats.lastPlayedAt)}
          </ThemedText>
        </ScrollView>
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
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    paddingBottom: Spacing.half,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: "45%",
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowTitle: {
    flex: 1,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.five,
  },
});
