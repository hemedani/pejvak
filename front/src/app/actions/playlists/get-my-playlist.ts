"use server";

/**
 * One playlist, its items resolved against the library, and the library itself.
 *
 * ## There is no singular read
 *
 * The act surface has `getMyPlaylists` and nothing that takes a `playlistId` for
 * reading. So this scans the list for the id — pages of fifty, at most twenty
 * pages — and then fetches the playlist's contents from the row it found. A miss
 * inside the cap is `ok(null)`, which the page renders as the app's 404. Hitting
 * the cap is *not* the same fact, so it comes back as a failure rather than
 * pretending the playlist does not exist.
 *
 * The cap is a design boundary, not a guess: a personal account with more than a
 * thousand playlists is outside what this console is for, and the alternatives —
 * a write-on-read hack or a new act — are worse than saying so.
 *
 * ## One library read, then a join
 *
 * Playlist items are ids only, so every row needs a library row to draw. Asking
 * `getTrackDetail` per item would be the N+1 the plan forbids (a 200-track
 * playlist would be 200 round trips), so the whole library is indexed once and
 * the items are joined in memory. Ids the index did not cover — a >5,000-track
 * library, or a track that has left it — fall back to a per-id read with bounded
 * concurrency, which is also what proves a row is genuinely gone.
 */

import { getLibraryIndex } from "@/app/actions/playlists/get-library-index";
import { getMyPlaylists } from "@/app/actions/playlists/get-my-playlists";
import { getTrackDetail } from "@/app/actions/tracks/get-track-detail";
import {
  isPlaylistId,
  orderedItems,
  type Playlist,
  type PlaylistEntry,
} from "@/lib/domain/playlist";
import { PLAYLIST_SCAN_MAX_PAGES, PLAYLIST_SCAN_PAGE_SIZE } from "@/lib/domain/playlist-query";
import type { TrackSummary } from "@/lib/domain/track";
import { fail, ok, type ActResult } from "@/lib/result";

export type PlaylistDetailData = {
  playlist: Playlist;
  /**
   * In playback order — the same sequence as `orderedItems(playlist)`, which is
   * what every index in the editor refers to.
   */
  entries: PlaylistEntry[];
  /** The whole library, for the add-track picker. Returned once, shared by both. */
  library: TrackSummary[];
};

/** How many per-id fallback reads run at once. */
const FALLBACK_CONCURRENCY = 8;

/** The row for `playlistId`, or `null` when the scan reached the end without it. */
async function findPlaylist(playlistId: string): Promise<ActResult<Playlist | null>> {
  for (let page = 1; page <= PLAYLIST_SCAN_MAX_PAGES; page += 1) {
    const result = await getMyPlaylists({ page, limit: PLAYLIST_SCAN_PAGE_SIZE });

    if (!result.success) {
      return result;
    }

    const found = result.body.playlists.find((playlist) => playlist.id === playlistId);
    if (found) {
      return ok(found);
    }

    // A short page is the end of the list: the id is not the listener's.
    if (!result.body.hasMore) {
      return ok(null);
    }
  }

  // Still full pages and no match: the list is longer than this read will walk.
  return fail("validation", "playlist not found within the scan limit");
}

/**
 * Per-id reads for the ids the index missed, eight at a time.
 *
 * A failure here is not propagated: an id that could not be read renders as a
 * missing track, which is the same row the listener would see for a track they
 * deleted. The list read is what reports a dead backend.
 */
async function resolveMissing(ids: readonly string[]): Promise<Map<string, TrackSummary>> {
  const found = new Map<string, TrackSummary>();
  const queue = [...ids];

  const worker = async (): Promise<void> => {
    for (;;) {
      const id = queue.shift();
      if (id === undefined) {
        return;
      }
      const result = await getTrackDetail(id);
      if (result.success && result.body !== null) {
        found.set(id, result.body);
      }
    }
  };

  const workers = Math.min(FALLBACK_CONCURRENCY, queue.length);
  await Promise.all(Array.from({ length: workers }, worker));

  return found;
}

export async function getMyPlaylistDetail(
  playlistId: string,
): Promise<ActResult<PlaylistDetailData | null>> {
  // A malformed id is a 404 before any network call — the same rule as the track
  // page, so a hand-typed URL never surfaces as a validation error.
  if (!isPlaylistId(playlistId)) {
    return ok(null);
  }

  const located = await findPlaylist(playlistId);
  if (!located.success) {
    return located;
  }
  if (located.body === null) {
    return ok(null);
  }

  const libraryResult = await getLibraryIndex();
  if (!libraryResult.success) {
    return libraryResult;
  }

  const library = libraryResult.body;
  const byId = new Map(library.map((track) => [track.id, track]));

  const items = orderedItems(located.body);
  const missing = [...new Set(items.map((item) => item.trackId))].filter((id) => !byId.has(id));

  if (missing.length > 0) {
    for (const [id, track] of await resolveMissing(missing)) {
      byId.set(id, track);
    }
  }

  const entries: PlaylistEntry[] = items.map((item) => ({
    item,
    track: byId.get(item.trackId) ?? null,
  }));

  return ok({ playlist: located.body, entries, library });
}
