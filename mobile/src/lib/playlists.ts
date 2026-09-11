import type { LocalTrack, PlaylistItem } from "@/lib/db/types";

/** Rewrites `order` to be contiguous from zero, preserving item sequence. */
export function normalizeOrder(items: PlaylistItem[]): PlaylistItem[] {
  return items.map((item, index) => ({ trackId: item.trackId, order: index }));
}

export function addTrackToPlaylist(
  items: PlaylistItem[],
  trackId: string,
): PlaylistItem[] {
  if (items.some((item) => item.trackId === trackId)) {
    return normalizeOrder(items);
  }
  return normalizeOrder([...items, { trackId, order: items.length }]);
}

export function removeTrackFromPlaylist(
  items: PlaylistItem[],
  trackId: string,
): PlaylistItem[] {
  return normalizeOrder(items.filter((item) => item.trackId !== trackId));
}

export function movePlaylistItem(
  items: PlaylistItem[],
  from: number,
  to: number,
): PlaylistItem[] {
  if (
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length ||
    from === to
  ) {
    return normalizeOrder(items);
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return normalizeOrder(next);
}

/** Track ids in playlist order, for lookup/playback. */
export function orderedTrackIds(items: PlaylistItem[]): string[] {
  return [...items].sort((a, b) => a.order - b.order).map((item) => item.trackId);
}

/** Resolves playlist items to library tracks in order, dropping missing tracks. */
export function resolvePlaylistTracks(
  items: PlaylistItem[],
  tracks: LocalTrack[],
): LocalTrack[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item) => byId.get(item.trackId))
    .filter((track): track is LocalTrack => track !== undefined);
}
