"use server";

/**
 * The listener's library, one page at a time.
 *
 * ## Why there is no `total`
 *
 * `getMyTracks` returns a bare array — no envelope, no count (plan §2 C3 read
 * literally: the act ends in `.toArray()`). So "page 3 of 12" cannot be
 * rendered without a second act that counts, and inventing one here would make
 * this module a second source of truth for how many tracks exist.
 *
 * What replaces it is `hasMore`: a full page means there is probably another,
 * a short page means there is not. That is exactly as much as the backend can
 * honestly tell us, and a "next" button that disappears one page late is a far
 * smaller lie than a total that disagrees with the list.
 *
 * ## Why search is not passed to the backend
 *
 * The act's `search` is a Mongo `$regex`, which compares raw bytes. `كتاب` with
 * an Arabic kaf and `کتاب` with a Persian one are the same word and different
 * bytes, so a server-side search misses the spelling the listener did not type
 * (plan §2.3). Folding happens in `lib/search.ts` instead, over a page large
 * enough to hold a personal library — see `SEARCH_LIMIT`.
 */

import { callAct } from "@/lib/call-act";
import { parseTrackList, TRACK_SUMMARY_GET, type TrackSummary } from "@/lib/domain/track";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_LIMIT,
  type TrackPage,
  type TrackQuery,
} from "@/lib/domain/track-query";
import { ok, type ActResult } from "@/lib/result";

export async function getMyTracks(query: TrackQuery = {}): Promise<ActResult<TrackPage>> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE));

  const result = await callAct("track", "getMyTracks", {
    set: {
      page,
      limit,
      ...(query.isAudiobook === undefined ? {} : { isAudiobook: query.isAudiobook }),
      ...(query.sortBy === undefined ? {} : { sortBy: query.sortBy }),
      ...(query.sortOrder === undefined ? {} : { sortOrder: query.sortOrder }),
    },
    get: TRACK_SUMMARY_GET,
  });

  if (!result.success) {
    return result;
  }

  const tracks = parseTrackList(result.body);

  return ok({ tracks, page, limit, hasMore: tracks.length >= limit });
}

/** Every track the library holds, up to `SEARCH_LIMIT`, for the search index. */
export async function getSearchableTracks(): Promise<ActResult<TrackSummary[]>> {
  const result = await callAct("track", "getMyTracks", {
    set: { page: 1, limit: SEARCH_LIMIT },
    get: TRACK_SUMMARY_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseTrackList(result.body));
}
