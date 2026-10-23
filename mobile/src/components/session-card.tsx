/**
 * One listening session in a list.
 *
 * A session is a *record*: the title identifies it, the time range and position
 * say when and how much, and the duration, speed and outcome are why the row
 * exists. It uses the same anatomy as every other dense row, so the History
 * list and a track's own session list read as one system.
 *
 * Tapping the body opens the session's own sheet, where the timeline, the
 * facts, the resume and the remove control live; the trailing controls add the
 * track to a playlist and remove the entry. They are deliberately *siblings* of
 * the pressable rather than children of it — nested, the row would fire its own
 * `onPress` while the finger is on the other glyph.
 */

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
  describeSessionStatus,
  describeSpeed,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  resumeTargetSec,
  type HistoryItem,
} from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { control, spacing } from "@/theme/tokens";

export type SessionCardProps = {
  item: HistoryItem;
  /**
   * Opens this session's own sheet — the timeline, the facts, resume, remove.
   *
   * The card deliberately does not resume on tap. What a session *was* is worth
   * a look before acting on it, and the resume the row used to perform is now
   * the sheet's primary button, one tap further in.
   */
  onOpen?: (item: HistoryItem) => void;
  /** Omit to hide the remove button — a session still in progress has no
   *  tombstone to write, since the tracker is still finalising it. */
  onDelete?: (item: HistoryItem) => void;
  /** Set by `ListGroup`; a row outside a group is its own whole card. */
  position?: ListRowPosition;
};

export function SessionCard({ item, onOpen, onDelete, position }: SessionCardProps) {
  const theme = useTheme();
  const addToPlaylist = useAddToPlaylist();
  const resumeSec = resumeTargetSec(item);

  const openPlaylistPicker = () =>
    void addToPlaylist({
      trackIds: [item.track.id],
      title: item.track.title,
      ramp: paletteFor(item.track.contentHash),
      artwork: item.track.artworkUrl,
    });

  const actions: RowAction[] = [
    {
      key: "add",
      width: control.sm,
      priority: 2,
      icon: "playlistAdd",
      label: `Add ${item.track.title} to a playlist`,
      onPress: openPlaylistPicker,
      node: (
        <BouncyIconButton
          name="playlistAdd"
          accessibilityLabel={`Add ${item.track.title} to a playlist`}
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
      label: `Remove ${item.track.title} from history`,
      danger: true,
      onPress: () => onDelete(item),
      node: (
        <BouncyIconButton
          name="trash"
          accessibilityLabel={`Remove ${item.track.title} from history`}
          size={control.sm}
          iconSize={17}
          tone="ghost"
          onPress={() => onDelete(item)}
        />
      ),
    });
  }

  return (
    <RecordRow
      position={position}
      title={item.track.title}
      meta={formatTimeRange(item.session.startedAt, item.session.endedAt)}
      detail={joinMeta([
        formatPositionRange(item.session.startPositionSec, item.session.endPositionSec),
        item.contextTitle,
      ])}
      status={describeSessionStatus(item.session)}
      trailing={
        <View style={styles.meta}>
          <ThemedText type="numeric" style={{ color: theme.accent }}>
            {formatDuration(item.session.durationListenedSec)}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {describeSpeed(item.session.playbackSpeed)}
          </ThemedText>
        </View>
      }
      onPress={onOpen ? () => onOpen(item) : undefined}
      // The hint names what the tap does *and* what is behind it: a listener
      // who wanted the resume the card used to perform is told, in the same
      // breath, that it is one tap further in and where it lands.
      accessibilityLabel={`Details for ${item.track.title}`}
      accessibilityHint={`Listened for ${formatDuration(item.session.durationListenedSec)}. Opens the timeline, and resumes at ${formatClock(resumeSec)}.`}
      actions={actions}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
});
