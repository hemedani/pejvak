"use server";

/**
 * The listener's playlists, one page at a time.
 *
 * The act is `getMyPlaylists` with `$sort: { updatedAt: -1 }` and no total, so
 * the list is ordered by "what changed last" rather than by when it was made —
 * which is the useful order for a screen whose only job is "pick one up again".
 * Reordering a playlist moves it to the top, and that is the act's contract, not
 * a bug to stabilise away.
 *
 * `hasMore` is `rows.length >= limit`, exactly as `getMyTracks` does it: a short
 * page is the last page. There is no count to render and no "page 3 of 12".
 */

import { callAct } from "@/lib/call-act";
import { parsePlaylistList, PLAYLIST_GET } from "@/lib/domain/playlist";
import { PLAYLIST_PAGE_SIZE, type PlaylistPage } from "@/lib/domain/playlist-query";
import { ok, type ActResult } from "@/lib/result";

export async function getMyPlaylists(
  query: { page?: number; limit?: number } = {},
): Promise<ActResult<PlaylistPage>> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.max(1, Math.floor(query.limit ?? PLAYLIST_PAGE_SIZE));

  const result = await callAct("playlist", "getMyPlaylists", {
    set: { page, limit },
    get: PLAYLIST_GET,
  });

  if (!result.success) {
    return result;
  }

  const playlists = parsePlaylistList(result.body);

  return ok({ playlists, page, limit, hasMore: playlists.length >= limit });
}
