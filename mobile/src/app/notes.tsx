/**
 * Every note the listener has written, in one list.
 *
 * Notes are created inside the player and were only ever visible one track at a
 * time, which made them nearly unfindable: the thing you remember writing is a
 * sentence, not the file it was written in. This screen is the index — searched
 * by the note itself, by its tags, by the track it is in and by the folder that
 * track sits in, and one tap from playing the moment it describes.
 *
 * Tapping does not open a detail view. A note *is* the detail; the useful action
 * is to hear what it was about, so the row goes straight to the player at that
 * second.
 */

import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { NoteRow } from "@/components/note-row";
import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { KeyboardAwareFlatList } from "@/components/ui/keyboard-scroll-view";
import { EmptyState, ListSurface, SkeletonRows } from "@/components/ui/row";
import { SearchField } from "@/components/ui/search-field";
import { useAllNotes } from "@/hooks/use-all-notes";
import { useTheme } from "@/hooks/use-theme";
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
import { miniPlayerInset, spacing } from "@/theme/tokens";

export default function NotesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { notes, loading, remove } = useAllNotes();
  const [query, setQuery] = useState("");

  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;

  /**
   * Folded once per data load. The note text is the title field, so a hit in it
   * carries highlight ranges; a hit in the track, the tags or the folder says
   * which field it found instead — a result whose reason is invisible reads as
   * a wrong result.
   */
  const index = useMemo(
    () => createSearchIndex(notes, noteSearchFields, NOTE_TITLE_FIELD),
    [notes],
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
      return notes.map((note) => ({ note, ranges: undefined, matched: null }));
    }
    return hits.map((hit) => ({
      note: hit.item,
      ranges: hit.ranges,
      matched:
        hit.field === NOTE_TITLE_FIELD
          ? null
          : `${describeField(hit.field)} · ${hit.value}`,
    }));
  }, [hits, notes, searching]);

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
        onBack={() => router.back()}
        overline="WHAT YOU NOTICED"
        title="Notes"
        subtitle={
          searching
            ? `${rows.length} of ${notes.length} notes`
            : notes.length > 0
              ? `${notes.length} note${notes.length === 1 ? "" : "s"}`
              : undefined
        }
      />
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search notes, tracks, tags…"
        accessibilityLabel="Search your notes"
      />
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
          ) : searching ? (
            <EmptyState
              icon="search"
              title={`No note matches “${query.trim()}”`}
              message="Try another word, the track it was in, or one of its tags."
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  // No gap: every row is a cell of one card, and a gap between cells would
  // break the side hairlines into disconnected segments.
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant + miniPlayerInset,
  },
  headerBlock: {
    gap: spacing.md,
    // The header is a cell of its own, so the space under it is its own too.
    paddingBottom: spacing.xl,
  },
});
