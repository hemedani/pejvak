/**
 * One note in the Notes list.
 *
 * The note's own words are the headline — that is what the listener wrote and
 * what they are scanning for — while the track it belongs to and the clock
 * inside it are the supporting line. Tapping opens the note's own sheet, the
 * same one a History row opens, where the note is shown in full with its place
 * on the track and a Resume button; playing it is a decision made *there*, so a
 * tap cannot start audio the listener only meant to read.
 *
 * The leading tile is the note's own colour at low alpha with the swatch in the
 * middle: the same colour the marker carries on the player's timeline, so a
 * note found here is recognisable there.
 */

import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import {
  deleteAction,
  ListRow,
  type ListRowPosition,
  type RowAction,
} from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import { joinMeta } from "@/lib/cardMeta";
import type { AnnotationWithTrack } from "@/lib/db/types";
import { describeNoteOrigin, describeNoteTags } from "@/lib/notes";
import { withAlpha } from "@/lib/palette";
import type { Range } from "@/lib/search";
import { formatClock } from "@/lib/time";
import { radius as radii, tile } from "@/theme/tokens";

export type NoteRowProps = {
  note: AnnotationWithTrack;
  /** Ranges into the note's text to tint — the search highlight. */
  titleRanges?: readonly Range[];
  /** Why this note is a result, when the match was not in its text. */
  matched?: string | null;
  position?: ListRowPosition;
  onOpen: (note: AnnotationWithTrack) => void;
  /** Omit to hide the delete action. */
  onDelete?: (note: AnnotationWithTrack) => void;
};

export const NoteRow = memo(function NoteRow({
  note,
  titleRanges,
  matched,
  position,
  onOpen,
  onDelete,
}: NoteRowProps) {
  const theme = useTheme();
  const color = note.annotation.color ?? theme.accent;
  const tags = describeNoteTags(note.annotation.tags);

  const actions: RowAction[] = onDelete
    ? [
        deleteAction({
          title: "note",
          onPress: () => onDelete(note),
        }),
      ]
    : [];

  return (
    <ListRow
      position={position}
      leading={
        <View style={[styles.tile, { backgroundColor: withAlpha(color, 0.14) }]}>
          <Icon name="notes" size={17} color={color} />
        </View>
      }
      leadingWidth={tile.md}
      title={note.annotation.text}
      titleRanges={titleRanges}
      titleLines={2}
      meta={joinMeta([matched, describeNoteOrigin(note)])}
      detail={tags}
      origin={note.track.origin}
      trailing={
        <ThemedText type="numeric" style={{ color }}>
          {formatClock(note.annotation.positionSec)}
        </ThemedText>
      }
      onPress={() => onOpen(note)}
      accessibilityLabel={`Note at ${formatClock(note.annotation.positionSec)} in ${note.track.title}`}
      accessibilityHint="Opens the note"
      actions={actions}
    />
  );
});

const styles = StyleSheet.create({
  tile: {
    width: tile.md,
    height: tile.md,
    borderRadius: radii.tile,
    alignItems: "center",
    justifyContent: "center",
  },
});
