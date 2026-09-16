/**
 * Listening statistics.
 *
 * Every figure here is tappable, and each one does the thing that figure is
 * actually *about*:
 *
 *   · `sessions` and `tracks` summarise a collection, so they open that
 *     collection — History and Library.
 *   · `listened` and `day streak` are single numbers with no list behind them,
 *     so they open a detail panel in place instead of promising a destination
 *     that does not exist. The caret-vs-chevron affordance says which is which.
 *   · A most-listened row opens that track's detail screen.
 *   · The longest session, and every session inside an expanded day, replays
 *     from that session's position — the same rule the History screen uses.
 */

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { Reveal } from "@/components/motion/Reveal";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { StatCell } from "@/components/stat-cell";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { useHistory } from "@/hooks/use-history";
import { formatDuration, resumeTargetSec, type HistoryItem } from "@/lib/history";
import {
  computeBestStreak,
  computeDailyListen,
  computeDayStreak,
  computeListeningStats,
  computeMediaBreakdown,
  computeTrackLeaders,
  sessionsOnDay,
} from "@/lib/stats";
import { spacing } from "@/theme/tokens";

/** Which stat cell has its detail panel open, if any. */
type ExpandedStat = "listened" | "streak";

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

function days(count: number): string {
  return `${count} day${count === 1 ? "" : "s"}`;
}

export default function StatsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { items, loading, refresh } = useHistory();
  const [expandedStat, setExpandedStat] = useState<ExpandedStat | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const stats = computeListeningStats(items);
  const leaders = computeTrackLeaders(items, 5);
  const streak = computeDayStreak(items);
  const bestStreak = computeBestStreak(items);
  const breakdown = computeMediaBreakdown(items);
  const recentDays = computeDailyListen(items).slice(-7).reverse();
  const peakDaySec = recentDays.reduce((max, day) => Math.max(max, day.listenTimeSec), 0);

  /** Replays a session from where it left off — shared with the History screen. */
  const replay = (item: HistoryItem) => {
    router.push({
      pathname: "/player",
      params: { trackId: item.track.id, positionSec: String(resumeTargetSec(item)) },
    });
  };

  const replayLongest = () => {
    if (!stats.longestSessionTrackId) {
      return;
    }
    router.push({
      pathname: "/player",
      params: {
        trackId: stats.longestSessionTrackId,
        positionSec: String(stats.longestSessionPositionSec),
      },
    });
  };

  const toggleStat = (key: ExpandedStat) => {
    setExpandedStat((current) => (current === key ? null : key));
  };

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
            affordance="expand"
            expanded={expandedStat === "listened"}
            onPress={() => toggleStat("listened")}
            style={styles.gridCell}
          />
          <StatCell
            index={1}
            icon="history"
            label="sessions"
            value={String(stats.sessionCount)}
            affordance="navigate"
            onPress={() => router.navigate("/history")}
            style={styles.gridCell}
          />
          <StatCell
            index={2}
            icon="music"
            label="tracks"
            value={String(stats.trackCount)}
            affordance="navigate"
            onPress={() => router.navigate("/")}
            style={styles.gridCell}
          />
          <StatCell
            index={3}
            icon="sparkle"
            label="day streak"
            value={String(streak)}
            affordance="expand"
            expanded={expandedStat === "streak"}
            onPress={() => toggleStat("streak")}
            style={styles.gridCell}
          />
        </View>

        {expandedStat ? (
          <Reveal key={expandedStat} index={4}>
            <GlassSurface flat style={styles.detail}>
              {expandedStat === "listened" ? (
                <>
                  {stats.totalListenTimeSec > 0 ? (
                    // Decorative: the rows below state the same numbers, so the
                    // bar is hidden from screen readers rather than repeated.
                    <View
                      style={styles.split}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants">
                      <View
                        style={[styles.splitSegment, { flex: breakdown.audiobookSec, backgroundColor: theme.accent }]}
                      />
                      <View
                        style={[
                          styles.splitSegment,
                          { flex: breakdown.musicSec, backgroundColor: theme.textTertiary },
                        ]}
                      />
                    </View>
                  ) : null}
                  <DetailRow label="Audiobooks" value={formatDuration(breakdown.audiobookSec)} />
                  <DetailRow label="Music" value={formatDuration(breakdown.musicSec)} />
                  <DetailRow
                    label="Average session"
                    value={formatDuration(stats.averageSessionSec)}
                  />
                </>
              ) : (
                <>
                  <DetailRow label="Best streak" value={days(bestStreak)} />
                  <DetailRow label="Days listened" value={days(stats.activeDayCount)} />
                  <DetailRow label="Sessions" value={String(stats.sessionCount)} />
                </>
              )}
            </GlassSurface>
          </Reveal>
        ) : null}

        <View style={styles.section}>
          <Reveal index={5}>
            <ThemedText type="overline" themeColor="textTertiary">
              MOST LISTENED
            </ThemedText>
          </Reveal>
          {leaders.length > 0 ? (
            leaders.map((leader, index) => (
              <Reveal key={leader.contentHash} index={6 + index}>
                <GlassSurface flat style={styles.row}>
                  <ElasticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${leader.title}`}
                    accessibilityHint={`${formatDuration(leader.listenTimeSec)} listened`}
                    onPress={() => router.push(`/track/${leader.trackId}`)}
                    style={styles.rowMain}>
                    <ThemedText type="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                      {leader.title}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {formatDuration(leader.listenTimeSec)} · {leader.playCount} play
                      {leader.playCount === 1 ? "" : "s"}
                    </ThemedText>
                  </ElasticPressable>
                  <Icon name="chevronRight" size={16} color={theme.textTertiary} />
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
          <Reveal index={11}>
            <ThemedText type="overline" themeColor="textTertiary">
              LONGEST SESSION
            </ThemedText>
          </Reveal>
          {stats.longestSessionTitle ? (
            <Reveal index={12}>
              <GlassSurface flat style={styles.row}>
                <ElasticPressable
                  accessibilityRole="button"
                  accessibilityLabel={`Replay ${stats.longestSessionTitle}`}
                  accessibilityHint={`Starts at the point this ${formatDuration(stats.longestSessionSec)} session began`}
                  onPress={replayLongest}
                  style={styles.rowMain}>
                  <ThemedText type="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                    {stats.longestSessionTitle}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.accent }}>
                    {formatDuration(stats.longestSessionSec)}
                  </ThemedText>
                </ElasticPressable>
                <Icon name="play" size={18} color={theme.accent} />
              </GlassSurface>
            </Reveal>
          ) : (
            <ThemedText type="caption" themeColor="textTertiary">
              Nothing yet.
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <Reveal index={13}>
            <ThemedText type="overline" themeColor="textTertiary">
              RECENT DAYS
            </ThemedText>
          </Reveal>
          {recentDays.length > 0 ? (
            <Reveal index={14}>
              <GlassSurface flat style={styles.daysCard}>
                {recentDays.map((day) => {
                  const ratio = peakDaySec > 0 ? day.listenTimeSec / peakDaySec : 0;
                  const open = expandedDay === day.key;
                  const sessions = open ? sessionsOnDay(items, day.key) : [];
                  return (
                    <View key={day.key} style={styles.dayBlock}>
                      <ElasticPressable
                        accessibilityRole="button"
                        accessibilityLabel={`${formatDay(day.key)}, ${formatDuration(day.listenTimeSec)}`}
                        accessibilityHint={open ? "Hides the sessions" : "Shows the sessions"}
                        accessibilityState={{ expanded: open }}
                        haptic="selection"
                        onPress={() => setExpandedDay((current) => (current === day.key ? null : day.key))}
                        style={styles.dayRow}>
                        <ThemedText type="caption" style={styles.dayLabel} numberOfLines={1}>
                          {formatDay(day.key)}
                        </ThemedText>
                        <View style={styles.dayTrack}>
                          <View
                            style={[
                              styles.dayFill,
                              {
                                width: `${Math.max(ratio * 100, day.listenTimeSec > 0 ? 4 : 0)}%`,
                                backgroundColor: theme.accent,
                              },
                            ]}
                          />
                        </View>
                        <ThemedText type="numeric" themeColor="textSecondary" style={styles.dayValue}>
                          {formatDuration(day.listenTimeSec)}
                        </ThemedText>
                        <Icon
                          name={open ? "chevronUp" : "chevronDown"}
                          size={14}
                          color={theme.textTertiary}
                        />
                      </ElasticPressable>

                      {open ? (
                        <View style={styles.daySessions}>
                          {sessions.length > 0 ? (
                            sessions.map((session) => (
                              <ElasticPressable
                                key={session.session.id}
                                accessibilityRole="button"
                                accessibilityLabel={`Replay ${session.track.title}`}
                                haptic="selection"
                                onPress={() => replay(session)}
                                style={styles.daySession}>
                                <Icon name="play" size={12} color={theme.accent} />
                                <ThemedText
                                  type="caption"
                                  numberOfLines={1}
                                  style={styles.daySessionTitle}>
                                  {session.track.title}
                                </ThemedText>
                                <ThemedText type="numeric" themeColor="textSecondary">
                                  {formatDuration(session.session.durationListenedSec)}
                                </ThemedText>
                              </ElasticPressable>
                            ))
                          ) : (
                            <ThemedText type="caption" themeColor="textTertiary">
                              No finished sessions.
                            </ThemedText>
                          )}
                        </View>
                      ) : null}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="bodyStrong">{value}</ThemedText>
    </View>
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
  detail: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  split: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  splitSegment: {
    height: 8,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    minWidth: 0,
  },
  rowTitle: {
    flex: 1,
  },
  daysCard: {
    // Tight gaps: the day rows are 44 pt touch targets, so generous spacing
    // here would make the card taller than the screen.
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 20,
  },
  dayBlock: {
    gap: spacing.sm,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // These were a static bar chart; now that a row opens its day, it has to be
    // a real touch target rather than the 20 pt the text happened to occupy.
    minHeight: 44,
  },
  dayLabel: {
    width: 84,
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
    width: 54,
    textAlign: "right",
  },
  daySessions: {
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingBottom: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(127,137,153,0.25)",
  },
  daySession: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
  },
  daySessionTitle: {
    flex: 1,
  },
});
