/**
 * The Library's playlist card.
 *
 * A playlist is the third thing the Recent tab can show. Its verbs are the same
 * three a folder gets — play, add to a playlist, history — resolved through
 * `PlaylistService` so the queue is the one playback would use.
 */

import { memo, useCallback, useMemo } from "react";

import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import { addToPlaylistAction, historyAction, playPlaylistAction } from "@/components/ui/row";
import type { LocalPlaylist } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import { describeRecentWhen } from "@/lib/recentPlays";
import type { Range } from "@/lib/search";
import { PlaylistService } from "@/services/PlaylistService";

export type LibraryPlaylistCardProps = {
  playlist: LocalPlaylist;
  lastPlayedAt: number;
  matched?: string | null;
  titleRanges?: readonly Range[];
  cardWidth: number;
  onOpen: (playlistId: string) => void;
  onPlay: (playlistId: string) => void;
};

export const LibraryPlaylistCard = memo(function LibraryPlaylistCard({
  playlist,
  lastPlayedAt,
  matched,
  titleRanges,
  cardWidth,
  onOpen,
  onPlay,
}: LibraryPlaylistCardProps) {
  const ramp = useMemo(() => paletteFor(playlist.title), [playlist.title]);
  const handlePress = useCallback(() => onOpen(playlist.id), [onOpen, playlist.id]);
  const play = useCallback(() => onPlay(playlist.id), [onPlay, playlist.id]);

  const resolveTrackIds = useCallback(async () => {
    const detail = await PlaylistService.loadDetail(playlist.id);
    return (detail?.tracks ?? [])
      .filter((track) => track.availability !== "missing")
      .map((track) => track.id);
  }, [playlist.id]);

  const actions = useMemo<MediaCardAction[]>(
    () => [
      playPlaylistAction({
        title: playlist.title,
        onPress: play,
        tone: "glass",
      }),
      addToPlaylistAction({
        title: playlist.title,
        ramp,
        resolveTrackIds,
        isBatch: true,
        tone: "glass",
      }),
      historyAction({
        type: "playlist",
        contextKey: playlist.id,
        title: playlist.title,
        tone: "glass",
      }),
    ],
    [play, playlist.id, playlist.title, ramp, resolveTrackIds],
  );

  const count = playlist.items.length;
  const meta = [
    matched,
    `${count} track${count === 1 ? "" : "s"}`,
    describeRecentWhen(lastPlayedAt),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <MediaCard
      title={playlist.title}
      titleRanges={titleRanges}
      meta={meta}
      paletteKey={playlist.title}
      cardWidth={cardWidth}
      onPress={handlePress}
      accessibilityLabel={`Open playlist ${playlist.title}`}
      accessibilityHint="Opens this playlist"
      actions={actions}
    />
  );
});
