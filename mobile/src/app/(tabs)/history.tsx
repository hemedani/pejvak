import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Share, StyleSheet, View } from "react-native";

import { ContextPlayCard } from "@/components/context-play-card";
import { DateRangeSheet } from "@/components/history/date-range-sheet";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { StretchCard } from "@/components/stretch-card";
import { ThemedText } from "@/components/themed-text";
import { SegmentedControl } from "@/components/ui/card/segmented-control";
import { GlassChip } from "@/components/ui/glass";
import {
  EmptyState,
  ListGroup,
  type ListRowPosition,
} from "@/components/ui/row";
import { SearchField } from "@/components/ui/search-field";
import { useContextHistory } from "@/hooks/use-context-history";
import { useHistory } from "@/hooks/use-history";
import { useResumeHistory } from "@/hooks/use-resume-history";
import { useTheme } from "@/hooks/use-theme";
import { buildRunSections } from "@/lib/contextHistory";
import {
  ANY_DATE,
  describeDateRange,
  isRangeActive,
  type DateRange,
} from "@/lib/dateRange";
import type { LocalContextPlay } from "@/lib/db/types";
import { historyToMarkdown } from "@/lib/exportHistory";
import {
  buildStretchSections,
  groupHistoryIntoStretches,
  HISTORY_SORT_OPTIONS,
  type HistoryStretch,
} from "@/lib/history";
import {
  runSearchFields,
  stretchSearchFields,
  TITLE_FIELD,
} from "@/lib/librarySearch";
import { contextRouteTarget } from "@/lib/playbackContext";
import {
  createSearchIndex,
  describeField,
  foldQuery,
  searchIndex,
  type SearchFieldName,
} from "@/lib/search";
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

/**
 * Why a row is in the results, when the headline does not say it.
 *
 * A listen found by one of its middle tracks, or by its collection, shows that
 * fact in place of the span it covered — a result whose reason is invisible
 * looks like a wrong result. Null when the match is in the headline itself,
 * where the row already reads as a match.
 */
function describeMatch(
  hit: { field: SearchFieldName; value: string } | undefined,
): string | null {
  if (hit === undefined || hit.field === TITLE_FIELD) {
    return null;
  }
  return `${describeField(hit.field)} · ${hit.value}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [dateOpen, setDateOpen] = useState(false);

  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;
  const filtering = searching || isRangeActive(range);

  /**
   * A search reads deeper than a page.
   *
   * The filter runs in JavaScript — folding Persian spellings is not something
   * SQL can do — so searching only the fifty listens already on screen would
   * answer "nothing found" for a listen further down, which reads as a broken
   * search. A date range needs no such thing: it is a `WHERE` clause, and the
   * list keeps paginating inside it.
   */
  const { items, loading, loadingMore, hasMore, refresh, loadMore } = useHistory(
    undefined,
    { range, deep: searching },
  );
  const { runs, loading: runsLoading, refresh: refreshRuns } = useContextHistory(
    undefined,
    { range, deep: searching },
  );
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

  /**
   * Folded once per data load, never per keystroke — the same rule the Library
   * follows. Every member title of every stretch is indexed, because a listener
   * remembers the fourth chapter of an evening, not the first.
   */
  const stretchIndex = useMemo(
    () => createSearchIndex(stretches, stretchSearchFields, TITLE_FIELD),
    [stretches],
  );
  const runIndex = useMemo(
    () => createSearchIndex(runs, runSearchFields, TITLE_FIELD),
    [runs],
  );
  const stretchHits = useMemo(
    () => searchIndex(stretchIndex, terms),
    [stretchIndex, terms],
  );
  const runHits = useMemo(() => searchIndex(runIndex, terms), [runIndex, terms]);

  const stretchMatches = useMemo(() => {
    const map = new Map<string, string>();
    for (const hit of stretchHits) {
      const reason = describeMatch(hit);
      if (reason) {
        map.set(hit.item.stretch.id, reason);
      }
    }
    return map;
  }, [stretchHits]);

  const runMatches = useMemo(() => {
    const map = new Map<string, string>();
    for (const hit of runHits) {
      const reason = describeMatch(hit);
      if (reason) {
        map.set(hit.item.id, reason);
      }
    }
    return map;
  }, [runHits]);

  const visibleStretches = useMemo(
    () => (searching ? stretchHits.map((hit) => hit.item) : stretches),
    [searching, stretchHits, stretches],
  );
  const visibleRuns = useMemo(
    () => (searching ? runHits.map((hit) => hit.item) : runs),
    [runHits, runs, searching],
  );

  const groups = useMemo<HistoryGroup[]>(() => {
    if (view === "sessions") {
      return buildStretchSections(visibleStretches, sort).map((section) => ({
        key: section.key,
        title: section.title,
        rows: section.data.map((entry): HistoryRow => ({ kind: "stretch", entry })),
      }));
    }
    return buildRunSections(visibleRuns, sort).map((section) => ({
      key: `runs-${section.key}`,
      title: section.title,
      rows: section.data.map((run): HistoryRow => ({ kind: "run", run })),
    }));
  }, [view, visibleStretches, visibleRuns, sort]);

  const showing = view === "sessions" ? visibleStretches.length : visibleRuns.length;
  const total = view === "sessions" ? stretches.length : runs.length;

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
      // A page is what the screen draws; an export is the whole archive. While
      // a filter is on, the archive and the screen are different things — so
      // the export follows the filter rather than quietly handing over listens
      // the listener is not looking at.
      //
      // A date range is a query, so it can be re-read at full length. A search
      // cannot: it is filtered in JavaScript over a deep-but-finite read, and
      // exporting the rows on screen is the only set the search actually
      // vouched for.
      const all = searching
        ? visibleStretches
        : groupHistoryIntoStretches(
            await LocalDBService.getSessionsForHistory(
              Number.MAX_SAFE_INTEGER,
              undefined,
              range,
            ),
          );
      await Share.share({
        title: "Listening history",
        // The same list the screen shows: one entry per listen, not per
        // track, so the document and the screen cannot describe it differently.
        message: historyToMarkdown(all),
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
                      matched={stretchMatches.get(row.entry.stretch.id) ?? null}
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
                      matched={runMatches.get(row.run.id) ?? null}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          // A search already holds everything it can see; paging it would
          // append rows the filter then has to throw away.
          if (view === "sessions" && !searching) {
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
                    ? `${showing}${hasMore ? "+" : ""} session${showing === 1 ? "" : "s"}`
                    : `${showing} collection${showing === 1 ? "" : "s"}`
                  : filtering
                    ? "No matches"
                    : undefined
              }
              action={
                <View style={styles.headerActions}>
                  <BouncyIconButton
                    name="notes"
                    accessibilityLabel="All notes"
                    size={control.lg}
                    iconSize={iconSize.md}
                    tone="glass"
                    onPress={() => router.push("/notes")}
                  />
                  {/* Export writes the track-by-track log; the Collections tab
                      has no writer yet, so the control is not offered there
                      rather than silently exporting something else. */}
                  {view === "sessions" && showing > 0 ? (
                    <BouncyIconButton
                      name="share"
                      accessibilityLabel="Export listening history"
                      size={control.lg}
                      iconSize={iconSize.md}
                      tone="glass"
                      onPress={() => void exportHistory()}
                    />
                  ) : null}
                </View>
              }
            />
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search tracks, collections…"
              accessibilityLabel="Search listening history"
              hint={
                searching
                  ? `${showing} of ${total} ${view === "sessions" ? "listens" : "collections"}`
                  : null
              }
            />
            <View style={styles.filterRow}>
              <GlassChip
                label={describeDateRange(range)}
                icon="clock"
                selected={isRangeActive(range)}
                accessibilityLabel={`Date filter: ${describeDateRange(range)}`}
                onPress={() => setDateOpen(true)}
              />
            </View>
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
              icon={filtering ? "search" : view === "sessions" ? "history" : "folder"}
              title={
                filtering
                  ? view === "sessions"
                    ? "No listens match"
                    : "No collections match"
                  : view === "sessions"
                    ? "No listening yet"
                    : "No collections played yet"
              }
              message={
                filtering
                  ? "Try another spelling or a wider date range — Persian variants are matched automatically."
                  : view === "sessions"
                    ? "Play a track and your sessions will show up here."
                    : "Start a folder or a playlist and its play-through will show up here."
              }
            />
          )
        }
      />
      {dateOpen ? (
        <DateRangeSheet
          range={range}
          onApply={setRange}
          onClose={() => setDateOpen(false)}
        />
      ) : null}
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
