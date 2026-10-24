import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Share, StyleSheet, View } from "react-native";

import { ContextPlayCard } from "@/components/context-play-card";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { StretchCard } from "@/components/stretch-card";
import { ThemedText } from "@/components/themed-text";
import { SegmentedControl } from "@/components/ui/card/segmented-control";
import {
  EmptyState,
  ListGroup,
  type ListRowPosition,
} from "@/components/ui/row";
import { useContextHistory } from "@/hooks/use-context-history";
import { useHistory } from "@/hooks/use-history";
import { useResumeHistory } from "@/hooks/use-resume-history";
import { useTheme } from "@/hooks/use-theme";
import { buildRunSections } from "@/lib/contextHistory";
import type { LocalContextPlay } from "@/lib/db/types";
import { historyToMarkdown } from "@/lib/exportHistory";
import {
  buildStretchSections,
  groupHistoryIntoStretches,
  HISTORY_SORT_OPTIONS,
  type HistoryStretch,
} from "@/lib/history";
import { contextRouteTarget } from "@/lib/playbackContext";
import { confirmRemoveRun, confirmRemoveStretch } from "@/lib/sessionActions";
import { LocalDBService } from "@/services/LocalDBService";
import { openSessionDetail } from "@/store/sessionDetailStore";
import { useSettingsStore } from "@/store/settingsStore";
import { control, dockInset, iconSize, spacing } from "@/theme/tokens";
import { listPerformance } from "@/lib/listPerformance";

/**
 * Which half of the history is showing.
 *
 * Two lists rather than one merged list: a listening session and a collection
 * run are different records — one continuous listen, one attempt at a whole
 * folder — and interleaved by time they would read as duplicates of each other,
 * because a run *contains* its sessions.
 */
type HistoryView = "sessions" | "collections";

const HISTORY_VIEWS: { value: HistoryView; label: string }[] = [
  { value: "sessions", label: "Sessions" },
  { value: "collections", label: "Collections" },
];

/** One row of the list, whichever half it came from. */
type HistoryRow =
  | { kind: "stretch"; entry: HistoryStretch }
  | { kind: "run"; run: LocalContextPlay };

/** One day's records, drawn as a single dense card. */
type HistoryGroup = {
  key: string;
  title: string | null;
  rows: HistoryRow[];
};

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { items, loading, loadingMore, hasMore, refresh, loadMore } = useHistory();
  const { runs, loading: runsLoading, refresh: refreshRuns } = useContextHistory();
  const resumeHistory = useResumeHistory();
  const sort = useSettingsStore((state) => state.historySort);
  const setSort = useSettingsStore((state) => state.setHistorySort);

  const [view, setView] = useState<HistoryView>("sessions");

  const refreshAll = useCallback(async () => {
    // Both halves in one pass: the two lists are read on the same screen, and
    // refreshing only the visible one would leave the other stale behind a chip.
    await Promise.all([refresh(), refreshRuns()]);
  }, [refresh, refreshRuns]);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
  );

  /**
   * The session list is a list of *listens*, not of rows.
   *
   * The query returns every member row of the newest stretches, so the grouping
   * is done here rather than in SQL: what a stretch is and when one counts as
   * complete is a rule about listening, and it belongs with the rest of that
   * reasoning, not spread across a query and a card.
   */
  const stretches = useMemo(() => groupHistoryIntoStretches(items), [items]);

  const groups = useMemo<HistoryGroup[]>(() => {
    if (view === "sessions") {
      return buildStretchSections(stretches, sort).map((section) => ({
        key: section.key,
        title: section.title,
        rows: section.data.map((entry): HistoryRow => ({ kind: "stretch", entry })),
      }));
    }
    return buildRunSections(runs, sort).map((section) => ({
      key: `runs-${section.key}`,
      title: section.title,
      rows: section.data.map((run): HistoryRow => ({ kind: "run", run })),
    }));
  }, [view, stretches, runs, sort]);

  const showing = view === "sessions" ? stretches.length : runs.length;

  /**
   * Tapping a listen opens its own sheet: what it was, how much of it was heard,
   * and the two things a row cannot offer — a way back into that second, and a
   * way to remove it.
   *
   * The resume itself lives in the sheet and goes through `useResumeHistory`,
   * the same function the card's old tap used, so the sheet's button and the row
   * can never disagree about where the playhead lands.
   */
  const openStretch = useCallback(
    (entry: HistoryStretch) => {
      openSessionDetail({
        target: { kind: "stretch", entry },
        // A delete inside the sheet tombstones rows this list is still showing,
        // so the screen is told to re-read rather than left with a ghost row.
        onChanged: () => void refreshAll(),
      });
    },
    [refreshAll],
  );

  /**
   * Tapping a run picks the *collection* back up, not the track: the queue is
   * rebuilt from the folder or playlist as it stands now, so a lecture added
   * since the last listen is included and a removed one is not.
   */
  const resumeRun = useCallback(
    (run: LocalContextPlay) => {
      void resumeHistory({ kind: "run", run });
    },
    [resumeHistory],
  );

  const openRun = useCallback(
    (run: LocalContextPlay) => {
      router.push(contextRouteTarget({ type: run.contextType, key: run.contextKey }));
    },
    [router],
  );

  /**
   * Removing a row removes the whole listen it stands for.
   *
   * Tombstoning one member would leave the card on screen with a different end
   * track and a fresh completeness verdict, so the row would appear not to have
   * gone anywhere.
   */
  const remove = useCallback(
    async (entry: HistoryStretch) => {
      await LocalDBService.softDeleteSessions(entry.items.map((item) => item.session.id));
      await refreshAll();
    },
    [refreshAll],
  );

  const removeRun = useCallback(
    async (run: LocalContextPlay) => {
      await LocalDBService.softDeleteContextPlay(run.id);
      await refreshAll();
    },
    [refreshAll],
  );

  /**
   * Stable per-row delete handlers. `StretchCard` and `ContextPlayCard` are
   * memoised, and an inline arrow here would be a new prop on every render and
   * re-render every mounted row.
   */
  const deleteStretch = useCallback(
    (entry: HistoryStretch) => {
      if (entry.stretch.endedAt === null) {
        return;
      }
      confirmRemoveStretch(entry, () => void remove(entry));
    },
    [remove],
  );

  const deleteRun = useCallback(
    (run: LocalContextPlay) => {
      confirmRemoveRun(run, () => void removeRun(run));
    },
    [removeRun],
  );

  const exportHistory = async () => {
    try {
      // A page is what the screen draws; an export is the whole archive. Reading
      // it separately is the difference between "my history" and "the part of my
      // history I happened to scroll to".
      const all = await LocalDBService.getSessionsForHistory(Number.MAX_SAFE_INTEGER);
      await Share.share({
        title: "Listening history",
        // The same list the screen shows: one entry per listen, not per
        // track, so the document and the screen cannot describe it differently.
        message: historyToMarkdown(groupHistoryIntoStretches(all)),
      });
    } catch {
      // The share sheet was dismissed or sharing is unavailable.
    }
  };

  return (
    <Screen wash={theme.accent}>
      <FlatList
        {...listPerformance}
        data={groups}
        keyExtractor={(group) => group.key}
        renderItem={({ item: group }) => {
          const last = group.rows.length - 1;
          return (
            <View style={styles.group}>
              {group.title ? (
                <View style={styles.sectionHeader}>
                  <ThemedText type="overline" themeColor="textTertiary">
                    {group.title}
                  </ThemedText>
                </View>
              ) : null}
              <ListGroup>
                {group.rows.map((row, index) => {
                  const position: ListRowPosition =
                    group.rows.length === 1
                      ? "only"
                      : index === 0
                        ? "first"
                        : index === last
                          ? "last"
                          : "middle";
                  return row.kind === "stretch" ? (
                    <StretchCard
                      key={`s-${row.entry.stretch.id}`}
                      entry={row.entry}
                      position={position}
                      onOpen={openStretch}
                      // A stretch that has not been finalised is still being
                      // written by the tracker, so there is nothing sensible to
                      // tombstone yet.
                      onDelete={
                        row.entry.stretch.endedAt === null ? undefined : deleteStretch
                      }
                    />
                  ) : (
                    <ContextPlayCard
                      key={`r-${row.run.id}`}
                      run={row.run}
                      position={position}
                      onPress={resumeRun}
                      onOpen={openRun}
                      onDelete={deleteRun}
                    />
                  );
                })}
              </ListGroup>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (view === "sessions") {
            void loadMore();
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          view === "sessions" && loadingMore ? (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.footer}>
              Loading older listens…
            </ThemedText>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              overline="EVERY SESSION, KEPT"
              title="History"
              subtitle={
                showing > 0
                  ? view === "sessions"
                    ? `${showing}${hasMore ? "+" : ""} sessions`
                    : `${showing} collections`
                  : undefined
              }
              action={
                // Export writes the track-by-track log; the Collections tab has
                // no writer yet, so the control is not offered there rather than
                // silently exporting something else.
                view === "sessions" && stretches.length > 0 ? (
                  <BouncyIconButton
                    name="share"
                    accessibilityLabel="Export listening history"
                    size={control.lg}
                    iconSize={iconSize.md}
                    tone="glass"
                    onPress={() => void exportHistory()}
                  />
                ) : undefined
              }
            />
            <SegmentedControl
              options={HISTORY_VIEWS}
              value={view}
              onChange={setView}
              accessibilityLabel="History view"
            />
            {showing > 0 ? (
              <SegmentedControl
                options={HISTORY_SORT_OPTIONS}
                value={sort}
                onChange={(next) => void setSort(next)}
                accessibilityLabel="Sort history"
              />
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={view === "sessions" ? loading : runsLoading}
            onRefresh={() => void refreshAll()}
          />
        }
        ListEmptyComponent={
          (view === "sessions" ? loading : runsLoading) ? null : (
            <EmptyState
              icon={view === "sessions" ? "history" : "folder"}
              title={view === "sessions" ? "No listening yet" : "No collections played yet"}
              message={
                view === "sessions"
                  ? "Play a track and your sessions will show up here."
                  : "Start a folder or a playlist and its play-through will show up here."
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + dockInset,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  group: {
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxs,
  },
  footer: {
    paddingVertical: spacing.md,
    textAlign: "center",
  },
});
