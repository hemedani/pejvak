/**
 * One listening stretch in the History list.
 *
 * A stretch is every track the player got through without the listener
 * deliberately changing track, so this row has to say two things a per-track
 * row cannot: which track the listen *started* on, and which one it *ended* on.
 * The headline therefore carries both ends joined by an arrow whenever the
 * stretch covered more than one file — "chapter 4" alone would not tell anyone
 * whether chapter 7 was reached.
 *
 * The one row that gets a status is the stretch heard from the first second of
 * its first track through to the end of its last: it says "Complete", in the
 * accent, because it is the only entry in this list that means "you finished
 * this" — everything else is a listen that stopped somewhere. The status is the
 * only marker; the row does not grow a second border or wash to repeat it.
 *
 * Tapping the body opens the listen's own sheet, where the timeline, the facts,
 * the resume and the remove control live; the trailing controls add the whole
 * stretch to a playlist and remove it. They are deliberately *siblings* of the
 * pressable rather than children of it.
 */

import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { useAddToPlaylist } from "@/components/add-to-playlist";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ThemedText } from "@/components/themed-text";
import {
  RecordRow,
  type ListRowPosition,
  type RowAction,
} from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import { joinMeta } from "@/lib/cardMeta";
import {
  describeSpeed,
  describeStretchStatus,
  describeStretchTitle,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  stretchResumeTarget,
  type HistoryStretch,
} from "@/lib/history";
import { describeStretchTracks } from "@/lib/listeningStretch";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { control, spacing } from "@/theme/tokens";

export type StretchCardProps = {
  entry: HistoryStretch;
  /**
   * Opens this listen's own sheet — the timeline, the facts, resume, remove.
   *
   * The card deliberately does not resume on tap. A listen is a thing worth
   * looking at before acting on, and the resume the row used to perform is now
   * the sheet's primary button, one tap further in.
   */
  onOpen?: (entry: HistoryStretch) => void;
  /** Omit to hide the remove button — a stretch still in progress has no
   *  tombstone to write, since the tracker is still finalising it. */
  onDelete?: (entry: HistoryStretch) => void;
  /** Set by `ListGroup`; a row outside a group is its own whole card. */
  position?: ListRowPosition;
};

export const StretchCard = memo(function StretchCard({
  entry,
  onOpen,
  onDelete,
  position,
}: StretchCardProps) {
  const theme = useTheme();
  const addToPlaylist = useAddToPlaylist();
  const { stretch } = entry;
  const target = stretchResumeTarget(entry);
  const title = describeStretchTitle(entry);

  const openPlaylistPicker = () =>
    void addToPlaylist({
      trackIds: [...new Set(entry.items.map((item) => item.track.id))],
      title: entry.start.track.title,
      ramp: paletteFor(entry.start.track.contentHash),
      artwork: entry.start.track.artworkUrl,
    });

  const actions: RowAction[] = [
    {
      key: "add",
      width: control.sm,
      priority: 2,
      icon: "playlistAdd",
      label: `Add ${entry.start.track.title} to a playlist`,
      onPress: openPlaylistPicker,
      node: (
        <BouncyIconButton
          name="playlistAdd"
          accessibilityLabel={`Add ${entry.start.track.title} to a playlist`}
          size={control.sm}
          iconSize={17}
          tone="ghost"
          onPress={openPlaylistPicker}
        />
      ),
    },
  ];

  if (onDelete) {
    actions.push({
      key: "delete",
      width: control.sm,
      priority: 1,
      icon: "trash",
      label: `Remove ${title} from history`,
      danger: true,
      onPress: () => onDelete(entry),
      node: (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={`Remove ${title} from history`}
          size={control.sm}
          iconSize={17}
          tone="ghost"
          onPress={() => onDelete(entry)}
        />
      ),
    });
  }

  return (
    <RecordRow
      position={position}
      title={title}
      meta={joinMeta([
        formatTimeRange(stretch.startedAt, stretch.endedAt),
        // Only worth saying when it is more than one: "1 track" is noise on a
        // row whose headline is already a single title.
        stretch.trackCount > 1 ? describeStretchTracks(stretch) : null,
      ])}
      detail={joinMeta([
        // First second of the first track, to the second the last one stopped
        // at — the span the stretch actually covered.
        formatPositionRange(stretch.startPositionSec, stretch.endPositionSec),
        entry.start.contextTitle,
      ])}
      status={describeStretchStatus(stretch)}
      trailing={
        <View style={styles.meta}>
          <ThemedText type="numeric" style={{ color: theme.accent }}>
            {formatDuration(stretch.listenedSec)}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {describeSpeed(stretch.playbackSpeed)}
          </ThemedText>
        </View>
      }
      onPress={onOpen ? () => onOpen(entry) : undefined}
      // The hint names what the tap does *and* what is behind it: a listener
      // who wanted the resume the row used to perform is told, in the same
      // breath, that it is one tap further in and where it lands.
      accessibilityLabel={`Details for ${title}`}
      accessibilityHint={`Listened for ${formatDuration(stretch.listenedSec)} over ${describeStretchTracks(stretch)}. Opens the timeline, and resumes at ${formatClock(target.positionSec)}.`}
      actions={actions}
    />
  );
});

const styles = StyleSheet.create({
  meta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
});
