import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import { useHistory } from "@/hooks/use-history";
import { formatDuration } from "@/lib/history";
import {
  computeDailyListen,
  computeDayStreak,
  computeListeningStats,
  computeTrackLeaders,
} from "@/lib/stats";
import { spacing } from "@/theme/tokens";

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
  const theme = useTheme();
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
  const peakDaySec = recentDays.reduce((max, day) => Math.max(max, day.listenTimeSec), 0);

  return (
    <Screen wash={theme.accent}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          overline="A QUIET RECORD OF YOUR TIME"
          title="Stats"
          subtitle={items.length > 0 ? `Last played ${formatLastPlayed(stats.lastPlayedAt)}` : undefined}
        />

        {!loading && items.length === 0 ? (
          <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
            Play something and your listening stats will appear here.
          </ThemedText>
        ) : null}

        <View style={styles.grid}>
          <StatCell
            index={0}
            icon="stats"
            label="listened"
            value={formatDuration(stats.totalListenTimeSec)}
            style={styles.gridCell}
          />
          <StatCell
            index={1}
            icon="history"
            label="sessions"
            value={String(stats.sessionCount)}
            style={styles.gridCell}
          />
          <StatCell
            index={2}
            icon="music"
            label="tracks"
            value={String(stats.trackCount)}
            style={styles.gridCell}
          />
          <StatCell
            index={3}
            icon="sparkle"
            label="day streak"
            value={String(streak)}
            style={styles.gridCell}
          />
        </View>

        <View style={styles.section}>
          <Reveal index={4}>
            <ThemedText type="overline" themeColor="textTertiary">
              MOST LISTENED
            </ThemedText>
          </Reveal>
          {leaders.length > 0 ? (
            leaders.map((leader, index) => (
              <Reveal key={leader.contentHash} index={5 + index}>
                <GlassSurface style={styles.row}>
                  <ThemedText type="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                    {leader.title}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {formatDuration(leader.listenTimeSec)} · {leader.playCount} play
                    {leader.playCount === 1 ? "" : "s"}
                  </ThemedText>
                </GlassSurface>
              </Reveal>
            ))
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              Nothing yet.
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <Reveal index={10}>
            <ThemedText type="overline" themeColor="textTertiary">
              LONGEST SESSION
            </ThemedText>
          </Reveal>
          {stats.longestSessionTitle ? (
            <Reveal index={11}>
              <GlassSurface style={styles.row}>
                <ThemedText type="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                  {stats.longestSessionTitle}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.accent }}>
                  {formatDuration(stats.longestSessionSec)}
                </ThemedText>
              </GlassSurface>
            </Reveal>
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              Nothing yet.
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <Reveal index={12}>
            <ThemedText type="overline" themeColor="textTertiary">
              RECENT DAYS
            </ThemedText>
          </Reveal>
          {recentDays.length > 0 ? (
            <Reveal index={13}>
              <GlassSurface flat style={styles.daysCard}>
                {recentDays.map((day) => {
                  const ratio = peakDaySec > 0 ? day.listenTimeSec / peakDaySec : 0;
                  return (
                    <View key={day.key} style={styles.dayRow}>
                      <ThemedText type="caption" style={styles.dayLabel} numberOfLines={1}>
                        {formatDay(day.key)}
                      </ThemedText>
                      <View style={styles.dayTrack}>
                        <View
                          style={[
                            styles.dayFill,
                            { width: `${Math.max(ratio * 100, day.listenTimeSec > 0 ? 4 : 0)}%`, backgroundColor: theme.accent },
                          ]}
                        />
                      </View>
                      <ThemedText type="numeric" themeColor="textSecondary" style={styles.dayValue}>
                        {formatDuration(day.listenTimeSec)}
                      </ThemedText>
                    </View>
                  );
                })}
              </GlassSurface>
            </Reveal>
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              Nothing yet.
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + 96,
    gap: spacing.xl,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: "45%",
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: 20,
  },
  rowTitle: {
    flex: 1,
  },
  daysCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dayLabel: {
    width: 92,
  },
  dayTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(127,137,153,0.2)",
    overflow: "hidden",
  },
  dayFill: {
    height: 6,
    borderRadius: 3,
  },
  dayValue: {
    width: 62,
    textAlign: "right",
  },
});
