/**
 * The Library's track card, with its action cluster built once per track.
 *
 * `MediaCard` is memoised, but a memoised card can only skip a render when its
 * props keep their identity. Building `trackActions(track)` in the screen made
 * a fresh array, fresh action objects and fresh control nodes on every render —
 * so every mounted row re-rendered whenever the list did, even though nothing
 * about the row had changed. Here the cluster is derived from the track and the
 * router, both stable between data loads.
 */

import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";

import { MediaCard, type MediaCardAction } from "@/components/ui/media-card";
import { addToPlaylistAction, detailsAction } from "@/components/ui/row";
import type { LocalTrack } from "@/lib/db/types";
import { paletteFor } from "@/lib/palette";
import type { Range } from "@/lib/search";
import { describeTrackStatus } from "@/lib/trackStatus";

export type LibraryTrackCardProps = {
  track: LocalTrack;
  /** The second line; a string so memo comparison is by value. */
  meta: string;
  /** The third line. `undefined` when the card has none. */
  detail?: string | null;
  titleRanges?: readonly Range[];
  cardWidth: number;
  onPlay: (trackId: string) => void;
  accessibilityHint: string;
};

export const LibraryTrackCard = memo(function LibraryTrackCard({
  track,
  meta,
  detail,
  titleRanges,
  cardWidth,
  onPlay,
  accessibilityHint,
}: LibraryTrackCardProps) {
  const router = useRouter();

  const status = useMemo(() => describeTrackStatus(track), [track]);
  const handlePress = useCallback(() => onPlay(track.id), [onPlay, track.id]);
  const actions = useMemo<MediaCardAction[]>(() => {
    const ramp = paletteFor(track.contentHash);
    return [
      addToPlaylistAction({
        title: track.title,
        ramp,
        artwork: track.artworkUrl,
        trackIds: [track.id],
      }),
      detailsAction({
        title: track.title,
        onPress: () => router.push(`/track/${track.id}`),
      }),
    ];
  }, [router, track]);

  return (
    <MediaCard
      title={track.title}
      titleRanges={titleRanges}
      meta={meta}
      detail={detail}
      status={status}
      artworkUrl={track.artworkUrl}
      paletteKey={track.contentHash}
      cardWidth={cardWidth}
      onPress={handlePress}
      accessibilityLabel={`Play ${track.title}`}
      accessibilityHint={accessibilityHint}
      actions={actions}
    />
  );
});
