/**
 * Every note the listener has written, in one list.
 *
 * Notes are created inside the player and were only ever visible one track at a
 * time, which made them nearly unfindable: the thing you remember writing is a
 * sentence, not the file it was written in. This screen is the index — searched
 * by the note itself, by its tags, by the track it is in and by the folder that
 * track sits in — and narrowed to a date range, the same control and the same
 * sheet the History screen uses, because "the notes I wrote last week" is as
 * ordinary a question as "the notes about this lecture".
 *
 * It is a dock destination rather than a pushed screen: notes are something the
 * listener *returns to*, not something they drill into from one track, and the
 * dock is the app's answer to "where does this live?".
 *
 * Tapping does not open a detail view. A note *is* the detail; the useful action
 * is to hear what it was about, so the row goes straight to the player at that
 * second.
 */

import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { DateRangeSheet } from "@/components/history/date-range-sheet";
import { NoteRow } from "@/components/note-row";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassChip } from "@/components/ui/glass";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-scroll-view";
import { EmptyState, ListSurface, SkeletonRows } from "@/components/ui/row";
import { SearchField } from "@/components/ui/search-field";
import { useAllNotes } from "@/hooks/use-all-notes";
import { useTheme } from "@/hooks/use-theme";
import {
  ANY_DATE,
  describeDateRange,
  isRangeActive,
  rangeContains,
  type DateRange,
} from "@/lib/dateRange";
import type { AnnotationWithTrack } from "@/lib/db/types";
import { listPerformance } from "@/lib/listPerformance";
import { rowPositionFor } from "@/lib/listSurface";
import { NOTE_TITLE_FIELD, noteSearchFields } from "@/lib/notes";
import {
  createSearchIndex,
  describeField,
  foldQuery,
  searchIndex,
  type Range,
} from "@/lib/search";
import { dockInset, spacing } from "@/theme/tokens";

export default function NotesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { notes, loading, remove } = useAllNotes();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [dateOpen, setDateOpen] = useState(false);

  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;
  const rangeActive = isRangeActive(range);
  const filtering = searching || rangeActive;

  /**
   * The date comes first, and the search reads what it leaves.
   *
   * Both are filters on the same list, so composing them in one order is the
   * whole of the behaviour: a note outside the range is not a note this screen
   * is about, and "no match" while a range is on must mean *inside the range*.
   * The index is therefore built over the date-filtered notes rather than over
   * everything, which also keeps the folded copy in step with what is shown.
   */
  const dated = useMemo(
    () =>
      rangeActive
        ? notes.filter((note) => rangeContains(range, note.annotation.createdAt))
        : notes,
    [notes, range, rangeActive],
  );

  /**
   * Folded once per data load. The note text is the title field, so a hit in it
   * carries highlight ranges; a hit in the track, the tags or the folder says
   * which field it found instead — a result whose reason is invisible reads as
   * a wrong result.
   */
  const index = useMemo(
    () => createSearchIndex(dated, noteSearchFields, NOTE_TITLE_FIELD),
    [dated],
  );
  const hits = useMemo(() => searchIndex(index, terms), [index, terms]);

  const rows = useMemo<
    {
      note: AnnotationWithTrack;
      ranges: readonly Range[] | undefined;
      matched: string | null;
    }[]
  >(() => {
    if (!searching) {
      return dated.map((note) => ({ note, ranges: undefined, matched: null }));
    }
    return hits.map((hit) => ({
      note: hit.item,
      ranges: hit.ranges,
      matched:
        hit.field === NOTE_TITLE_FIELD
          ? null
          : `${describeField(hit.field)} · ${hit.value}`,
    }));
  }, [dated, hits, searching]);

  /** Play the moment the note describes — the only thing a note can do. */
  const open = useCallback(
    (note: AnnotationWithTrack) => {
      router.push({
        pathname: "/player",
        params: {
          trackId: note.track.id,
          positionSec: String(note.annotation.positionSec),
        },
      });
    },
    [router],
  );

  const confirmDelete = useCallback(
    (note: AnnotationWithTrack) => {
      Alert.alert(
        "Delete note?",
        `"${note.annotation.text}" will be removed from ${note.track.title}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => void remove(note),
          },
        ],
      );
    },
    [remove],
  );

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        overline="WHAT YOU NOTICED"
        title="Notes"
        subtitle={
          searching
            ? `${rows.length} of ${dated.length} notes`
            : dated.length > 0
              ? `${dated.length} note${dated.length === 1 ? "" : "s"}${rangeActive ? " in range" : ""}`
              : undefined
        }
      />
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search notes, tracks, tags…"
        accessibilityLabel="Search your notes"
      />
      <View style={styles.filterRow}>
        <GlassChip
          label={describeDateRange(range)}
          icon="clock"
          selected={rangeActive}
          accessibilityLabel={`Date filter: ${describeDateRange(range)}`}
          onPress={() => setDateOpen(true)}
        />
      </View>
      {searching ? (
        <ThemedText type="caption" themeColor="textTertiary">
          Persian spellings are matched automatically.
        </ThemedText>
      ) : null}
    </View>
  );

  return (
    <Screen wash={theme.accent}>
      <KeyboardAwareFlatList
        {...listPerformance}
        data={rows}
        keyExtractor={(row) => row.note.annotation.id}
        renderItem={({ item, index }) => (
          <ListSurface position={rowPositionFor(index, rows.length)}>
            <NoteRow
              note={item.note}
              titleRanges={item.ranges}
              matched={item.matched}
              onOpen={open}
              onDelete={confirmDelete}
            />
          </ListSurface>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <SkeletonRows count={4} />
          ) : filtering ? (
            <EmptyState
              icon="search"
              title={
                searching
                  ? `No note matches “${query.trim()}”`
                  : "No notes in this range"
              }
              message={
                searching
                  ? rangeActive
                    ? "Try another word, or widen the date range — Persian variants are matched automatically."
                    : "Try another word, the track it was in, or one of its tags."
                  : "Try a wider date range."
              }
            />
          ) : (
            <EmptyState
              icon="notes"
              title="No notes yet"
              message="Tap “Note” in the player to capture the moment — it will show up here."
            />
          )
        }
      />
      {dateOpen ? (
        <DateRangeSheet
          range={range}
          subject="notes"
          onApply={setRange}
          onClose={() => setDateOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // No gap: every row is a cell of one card, and a gap between cells would
  // break the side hairlines into disconnected segments.
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + dockInset,
  },
  headerBlock: {
    gap: spacing.md,
    // The header is a cell of its own, so the space under it is its own too.
    paddingBottom: spacing.xl,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
