import type { LocalTrack, PlaylistItem } from "@/lib/db/types";

/** Rewrites `order` to be contiguous from zero, preserving item sequence. */
export function normalizeOrder(items: PlaylistItem[]): PlaylistItem[] {
  return items.map((item, index) => ({ trackId: item.trackId, order: index }));
}

export function addTrackToPlaylist(
  items: PlaylistItem[],
  trackId: string,
): PlaylistItem[] {
  return addTracksToPlaylist(items, [trackId]);
}

/**
 * Adds several tracks in one pass, preserving the given order and skipping any
 * that are already present.
 *
 * The single-track case delegates here so the "already there" rule is expressed
 * exactly once — and so adding a whole folder costs one playlist write rather
 * than one per track.
 *
 * Duplicates *within* `trackIds` are collapsed too: a folder can legitimately
 * hold the same content twice (the same lecture saved under two names), and
 * adding both would put two identical rows in the playlist.
 */
export function addTracksToPlaylist(
  items: PlaylistItem[],
  trackIds: readonly string[],
): PlaylistItem[] {
  const present = new Set(items.map((item) => item.trackId));
  const additions: PlaylistItem[] = [];

  for (const trackId of trackIds) {
    if (present.has(trackId)) {
      continue;
    }
    present.add(trackId);
    additions.push({ trackId, order: items.length + additions.length });
  }

  if (additions.length === 0) {
    return normalizeOrder(items);
  }
  return normalizeOrder([...items, ...additions]);
}

/** Removes several tracks at once, keeping the remaining order intact. */
export function removeTracksFromPlaylist(
  items: PlaylistItem[],
  trackIds: readonly string[],
): PlaylistItem[] {
  const doomed = new Set(trackIds);
  return normalizeOrder(items.filter((item) => !doomed.has(item.trackId)));
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
