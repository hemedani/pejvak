/**
 * The Library's playlist card.
 *
 * A playlist is the third thing the Recent tab can show. Its verbs are the same
 * three a folder gets — play, add to a playlist, history — resolved through
 * `PlaylistService` so the queue is the one playback would use.
 */

import { memo, useCallback, useMemo } from "react";

import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import {
  addToPlaylistAction,
  deleteAction,
  historyAction,
  playPlaylistAction,
} from "@/components/ui/row";
import type { LocalPlaylist } from "@/lib/db/types";
import type { ItemOrigin } from "@/lib/origin";
import { paletteFor } from "@/lib/palette";
import { describeRecentWhen } from "@/lib/recentPlays";
import type { Range } from "@/lib/search";
import { PlaylistService } from "@/services/PlaylistService";

export type LibraryPlaylistCardProps = {
  playlist: LocalPlaylist;
  /**
   * When it was last played, or `null` on the Playlists tab, which lists every
   * playlist rather than the ones recently opened. `null` drops the clause
   * instead of inventing a date.
   */
  lastPlayedAt?: number | null;
  matched?: string | null;
  /** Resolved by the screen: a playlist has no origin of its own. */
  origin?: ItemOrigin | null;
  titleRanges?: readonly Range[];
  cardWidth: number;
  onOpen: (playlistId: string) => void;
  onPlay: (playlistId: string) => void;
  /** Offered only where a playlist can be removed — the Playlists tab. */
  onDelete?: (playlist: LocalPlaylist) => void;
};

export const LibraryPlaylistCard = memo(function LibraryPlaylistCard({
  playlist,
  lastPlayedAt = null,
  matched,
  origin,
  titleRanges,
  cardWidth,
  onOpen,
  onPlay,
  onDelete,
}: LibraryPlaylistCardProps) {
  const ramp = useMemo(() => paletteFor(playlist.title), [playlist.title]);
  const handlePress = useCallback(() => onOpen(playlist.id), [onOpen, playlist.id]);
  const play = useCallback(() => onPlay(playlist.id), [onPlay, playlist.id]);
  const remove = useCallback(() => {
    onDelete?.(playlist);
  }, [onDelete, playlist]);

  const resolveTrackIds = useCallback(async () => {
    const detail = await PlaylistService.loadDetail(playlist.id);
    return (detail?.tracks ?? [])
      .filter((track) => track.availability !== "missing")
      .map((track) => track.id);
  }, [playlist.id]);

  const actions = useMemo<MediaCardAction[]>(() => {
    const list: MediaCardAction[] = [
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
    ];
    if (onDelete) {
      list.push(deleteAction({ title: playlist.title, onPress: remove }));
    }
    return list;
  }, [onDelete, play, playlist.id, playlist.title, ramp, remove, resolveTrackIds]);

  const count = playlist.items.length;
  const meta = [
    matched,
    `${count} track${count === 1 ? "" : "s"}`,
    lastPlayedAt === null ? null : describeRecentWhen(lastPlayedAt),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <MediaCard
      title={playlist.title}
      titleRanges={titleRanges}
      meta={meta}
      origin={origin}
      paletteKey={playlist.title}
      cardWidth={cardWidth}
      onPress={handlePress}
      accessibilityLabel={`Open playlist ${playlist.title}`}
      accessibilityHint="Opens this playlist"
      actions={actions}
    />
  );
});
