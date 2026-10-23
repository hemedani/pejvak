/**
 * One track inside an online collection.
 *
 * The row has to say three things at once and say them quietly: what the item
 * is, whether it is playing, and whether it is on the device. It does that with
 * one leading marker and one status line rather than with badges, because a
 * course is thirty of these in a column and any row that shouts makes the list
 * unreadable.
 *
 * It is a dense `ListRow`, not its own card: the screen wraps a whole series in
 * one `ListGroup`, so the card edge belongs to the series rather than to each
 * episode.
 *
 * Titles are the reason this file is not trivial. They arrive in Persian, and a
 * right-to-left line left-aligned in a left-to-right layout reads as a rendering
 * bug; `RowShell`'s `UserText` flips the alignment per title, so a Persian
 * course and a Latin episode inside it both look deliberate.
 */

import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { ListRow, type ListRowPosition } from "@/components/ui/row";
import { useTheme } from "@/hooks/use-theme";
import type { LocalDownloadJob, LocalTrack } from "@/lib/db/types";
import { formatDuration } from "@/lib/history";
import type { StatusSpec } from "@/lib/rowStatus";
import { withAlpha } from "@/lib/palette";
import { radius as radii } from "@/theme/tokens";

export type OnlineTrackRowProps = {
  track: LocalTrack;
  /** 1-based position in the collection, shown when nothing is playing. */
  ordinal: number;
  isCurrent: boolean;
  /** This track's own download row, when the collection is being downloaded. */
  job?: LocalDownloadJob | null;
  onPress: () => void;
  /** Supplied by `ListGroup`; not part of the row's own API. */
  position?: ListRowPosition;
};

/**
 * The one state this track is in.
 *
 * A downloaded file wins over a job row: the bytes are here, whatever the queue
 * last said about them. Everything else is the job's own word, and a track with
 * no job is simply streaming.
 */
function statusOf(downloaded: boolean, job: LocalDownloadJob | null | undefined): StatusSpec {
  if (downloaded) {
    return { kind: "downloaded", label: "On device" };
  }
  switch (job?.state) {
    case "queued":
      return { kind: "downloading", label: "Waiting" };
    case "running":
      return { kind: "downloading", label: "Downloading" };
    case "failed":
      return { kind: "failed", label: "Failed" };
    case "cancelled":
      return { kind: "paused", label: "Stopped" };
    default:
      return { kind: "streamed", label: "Streams" };
  }
}

export function OnlineTrackRow({
  track,
  ordinal,
  isCurrent,
  job,
  onPress,
  position,
}: OnlineTrackRowProps) {
  const theme = useTheme();
  const tint = theme.accent;
  const downloaded = track.downloadedAt !== null;

  return (
    <ListRow
      position={position}
      leading={
        /* The marker is a small chip rather than bare digits, so the row that
           is playing is findable in a column of thirty without reading. */
        <View
          style={[
            styles.leading,
            {
              backgroundColor: isCurrent ? withAlpha(tint, 0.18) : theme.surfaceSunken,
              borderColor: isCurrent ? tint : theme.outlineVariant,
            },
          ]}>
          {isCurrent ? (
            <Icon name="play" size={14} color={tint} />
          ) : (
            <ThemedText type="numeric" themeColor="textTertiary">
              {String(ordinal).padStart(2, "0")}
            </ThemedText>
          )}
        </View>
      }
      leadingWidth={30}
      title={track.title}
      titleLines={2}
      meta={track.durationSec > 0 ? formatDuration(track.durationSec) : null}
      status={statusOf(downloaded, job)}
      onPress={onPress}
      accessibilityLabel={track.title}
      accessibilityHint={downloaded ? "Plays from this device" : "Streams from the source"}
    />
  );
}

const styles = StyleSheet.create({
  leading: {
    width: 30,
    height: 30,
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
