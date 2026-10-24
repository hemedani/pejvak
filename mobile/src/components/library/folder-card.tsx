/**
 * The Library's folder card, shared by the Folders and Recent tabs.
 *
 * Both tabs draw the same folder and must offer the same verbs, so the card is
 * one component rather than two render functions. It owns its action cluster so
 * a parent re-render cannot rebuild three controls and defeat `MediaCard`'s memo
 * comparison.
 */

import { memo, useCallback, useMemo } from "react";

import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import { addToPlaylistAction, historyAction, playFolderAction } from "@/components/ui/row";
import type { FolderSummary } from "@/lib/db/types";
import { describeFolderProgress, folderProgressRatio } from "@/lib/folderPlay";
import { formatDuration } from "@/lib/history";
import { paletteFor } from "@/lib/palette";
import { formatPlayCount } from "@/lib/playbackContext";
import type { Range } from "@/lib/search";
import { LocalDBService } from "@/services/LocalDBService";

export type LibraryFolderCardProps = {
  folder: FolderSummary;
  /** Recent's last-played clause; omitted on the Folders tab. */
  when?: string | null;
  /** Why the card matched, while searching. */
  matched?: string | null;
  titleRanges?: readonly Range[];
  cardWidth: number;
  onOpen: (folderKey: string) => void;
  onPlay: (folderKey: string) => void;
};

export const LibraryFolderCard = memo(function LibraryFolderCard({
  folder,
  when,
  matched,
  titleRanges,
  cardWidth,
  onOpen,
  onPlay,
}: LibraryFolderCardProps) {
  const ramp = useMemo(() => paletteFor(folder.key), [folder.key]);
  const handlePress = useCallback(() => onOpen(folder.key), [folder.key, onOpen]);
  const play = useCallback(() => onPlay(folder.key), [folder.key, onPlay]);

  /**
   * Resolved on tap rather than per card: a folder holds counts, not its
   * contents, and forty cards each running a query for a button nobody has
   * pressed is the cost this avoids. Missing files are left out, matching the
   * folder screen — a playlist is a promise to play something later, and a
   * file whose bytes are gone cannot keep it.
   */
  const resolveTrackIds = useCallback(
    async () =>
      (await LocalDBService.getTracksByFolder(folder.key))
        .filter((track) => track.availability !== "missing")
        .map((track) => track.id),
    [folder.key],
  );

  const actions = useMemo<MediaCardAction[]>(
    () => [
      playFolderAction({
        title: folder.name,
        onPress: play,
        tone: "glass",
      }),
      addToPlaylistAction({
        title: folder.name,
        ramp,
        artwork: folder.artworkUrl,
        resolveTrackIds,
        isBatch: true,
        tone: "glass",
      }),
      historyAction({
        type: "folder",
        contextKey: folder.key,
        title: folder.name,
        artwork: folder.artworkUrl,
        tone: "glass",
      }),
    ],
    [folder, play, ramp, resolveTrackIds],
  );

  const meta = [
    matched,
    describeFolderProgress(folder.finishedCount, folder.trackCount),
    folder.totalDurationSec > 0 ? formatDuration(folder.totalDurationSec) : null,
    formatPlayCount(folder.playCount),
    when ?? null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <MediaCard
      title={folder.name}
      titleRanges={titleRanges}
      meta={meta}
      artworkUrl={folder.artworkUrl}
      paletteKey={folder.key}
      progressRatio={folderProgressRatio(folder.finishedCount, folder.trackCount)}
      cardWidth={cardWidth}
      onPress={handlePress}
      accessibilityLabel={`Open folder ${folder.name}`}
      accessibilityHint="Opens this folder"
      actions={actions}
    />
  );
});
