import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, SectionList, Share, StyleSheet, View } from "react-native";

import { ContextPlayCard } from "@/components/context-play-card";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { StretchCard } from "@/components/stretch-card";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass/GlassChip";
import { useContextHistory } from "@/hooks/use-context-history";
import { useHistory } from "@/hooks/use-history";
import { useTheme } from "@/hooks/use-theme";
import { buildRunSections } from "@/lib/contextHistory";
import type { LocalContextPlay } from "@/lib/db/types";
import { historyToMarkdown } from "@/lib/exportHistory";
import {
  buildStretchSections,
  groupHistoryIntoStretches,
  HISTORY_SORT_OPTIONS,
  stretchResumeTarget,
  type HistoryStretch,
} from "@/lib/history";
import { contextRouteTarget } from "@/lib/playbackContext";
import { confirmRemoveRun, confirmRemoveStretch, stretchResumeParams } from "@/lib/sessionActions";
import { ContextService } from "@/services/ContextService";
import { LocalDBService } from "@/services/LocalDBService";
import { useSettingsStore } from "@/store/settingsStore";
import { spacing } from "@/theme/tokens";

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

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { items, loading, refresh } = useHistory();
  const { runs, loading: runsLoading, refresh: refreshRuns } = useContextHistory();
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

  const sections = useMemo(() => {
    if (view === "sessions") {
      return buildStretchSections(stretches, sort).map((section) => ({
        key: section.key,
        title: section.title,
        data: section.data.map((entry): HistoryRow => ({ kind: "stretch", entry })),
      }));
    }
    return buildRunSections(runs, sort).map((section) => ({
      key: `runs-${section.key}`,
      title: section.title,
      data: section.data.map((run): HistoryRow => ({ kind: "run", run })),
    }));
  }, [view, stretches, runs, sort]);

  const showing = view === "sessions" ? stretches.length : runs.length;

  /**
   * Tapping a stretch picks up where that listen left off.
   *
   * When the stretch was part of a collection it resumes *the collection*, not
   * the track: the listener stopped inside a folder or a playlist, and dropping
   * them into a queue of one would end the series at that lecture — and would
   * record a fresh single-track run against nothing. If the collection has since
   * gone, or no longer holds that track, the plain single-track resume is still
   * the right fallback.
   */
  const resume = async (entry: HistoryStretch) => {
    const { stretch } = entry;
    const target = stretchResumeTarget(entry);
    if (stretch.contextType && stretch.contextKey !== null) {
      const trackId = await ContextService.startAt(
        { type: stretch.contextType, key: stretch.contextKey },
        target.item.track.id,
        target.positionSec,
      );
      if (trackId) {
        router.push({ pathname: "/player", params: { trackId } });
        return;
      }
    }
    router.push({ pathname: "/player", params: stretchResumeParams(entry) });
  };

  /**
   * Tapping a run picks the *collection* back up, not the track: the queue is
   * rebuilt from the folder or playlist as it stands now, so a lecture added
   * since the last listen is included and a removed one is not.
   */
  const resumeRun = async (run: LocalContextPlay) => {
    const trackId = await ContextService.resume(run);
    if (!trackId) {
      Alert.alert(
        "Nothing to play",
        `"${run.contextTitle}" has no playable tracks any more — it may have been deleted or emptied.`,
      );
      return;
    }
    router.push({ pathname: "/player", params: { trackId } });
  };

  const openRun = (run: LocalContextPlay) => {
    router.push(contextRouteTarget({ type: run.contextType, key: run.contextKey }));
  };

  /**
   * Removing a row removes the whole listen it stands for.
   *
   * Tombstoning one member would leave the card on screen with a different end
   * track and a fresh completeness verdict, so the row would appear not to have
   * gone anywhere.
   */
  const remove = async (entry: HistoryStretch) => {
    await LocalDBService.softDeleteSessions(entry.items.map((item) => item.session.id));
    await refreshAll();
  };

  const removeRun = async (run: LocalContextPlay) => {
    await LocalDBService.softDeleteContextPlay(run.id);
    await refreshAll();
  };

  const exportHistory = async () => {
    try {
      await Share.share({
        title: "Listening history",
        // The same list the screen shows: one entry per listen, not per
        // track, so the document and the screen cannot describe it differently.
        message: historyToMarkdown(stretches),
      });
    } catch {
      // The share sheet was dismissed or sharing is unavailable.
    }
  };

  return (
    <Screen wash={theme.accent}>
      <SectionList
        sections={sections}
        keyExtractor={(row) =>
          row.kind === "stretch" ? `s-${row.entry.stretch.id}` : `r-${row.run.id}`
        }
        renderItem={({ item: row }) =>
          row.kind === "stretch" ? (
            <StretchCard
              entry={row.entry}
              onPress={resume}
              // A stretch that has not been finalised is still being written by
              // the tracker, so there is nothing sensible to tombstone yet.
              onDelete={
                row.entry.stretch.endedAt === null
                  ? undefined
                  : (entry) => confirmRemoveStretch(entry, () => void remove(entry))
              }
            />
          ) : (
            <ContextPlayCard
              run={row.run}
              onPress={(run) => void resumeRun(run)}
              onOpen={openRun}
              onDelete={(run) => confirmRemoveRun(run, () => void removeRun(run))}
            />
          )
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.sectionHeader}>
              <ThemedText type="overline" themeColor="textTertiary">
                {section.title}
              </ThemedText>
            </View>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader
              overline="EVERY SESSION, KEPT"
              title="History"
              subtitle={
                showing > 0
                  ? view === "sessions"
                    ? `${showing} sessions`
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
                    size={42}
                    iconSize={19}
                    tone="glass"
                    onPress={() => void exportHistory()}
                  />
                ) : undefined
              }
            />
            <View style={styles.filters}>
              {HISTORY_VIEWS.map((option) => (
                <GlassChip
                  key={option.value}
                  label={option.label}
                  selected={view === option.value}
                  accessibilityLabel={`Show ${option.label.toLowerCase()} in history`}
                  onPress={() => setView(option.value)}
                />
              ))}
            </View>
            {showing > 0 ? (
              <View style={styles.filters}>
                {HISTORY_SORT_OPTIONS.map((option) => (
                  <GlassChip
                    key={option.value}
                    label={option.label}
                    selected={sort === option.value}
                    accessibilityLabel={`Sort history by ${option.label.toLowerCase()}`}
                    onPress={() => void setSort(option.value)}
                  />
                ))}
              </View>
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
            <ThemedText type="caption" themeColor="textTertiary" style={styles.empty}>
              {view === "sessions"
                ? "No listening yet. Play a track and your sessions will show up here."
                : "No collections played yet. Start a folder or a playlist and it will show up here."}
            </ThemedText>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + 96,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.huge,
  },
});
