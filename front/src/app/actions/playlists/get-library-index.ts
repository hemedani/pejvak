"use server";

/**
 * The whole library, paged into one array, for the add-track picker.
 *
 * ## Why an array and not a `Map`
 *
 * A `Map` does not survive the server/client boundary — React serialises it as
 * `{}`, which reads as "no tracks" and silently empties the picker. So this
 * returns rows and every caller builds its own index, which is also what lets
 * the picker hand the same array to a search index.
 *
 * ## Why it is not one big request
 *
 * `getMyTracks` takes a `limit`, and asking for five thousand rows in one call
 * is a payload nobody has measured. Pages of a hundred with a stop on the first
 * short page keep the common case (a few hundred tracks) at four or five reads
 * and bound the pathological one at fifty.
 *
 * Past that bound the index is simply incomplete, and the detail read resolves
 * the ids it missed one by one. This function never claims to be exhaustive.
 */

import { getMyTracks } from "@/app/actions/tracks/get-my-tracks";
import type { TrackSummary } from "@/lib/domain/track";
import { PLAYLIST_LIBRARY_MAX_PAGES, PLAYLIST_LIBRARY_PAGE_SIZE } from "@/lib/domain/playlist-query";
import { ok, type ActResult } from "@/lib/result";

export async function getLibraryIndex(): Promise<ActResult<TrackSummary[]>> {
  const tracks: TrackSummary[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= PLAYLIST_LIBRARY_MAX_PAGES; page += 1) {
    const result = await getMyTracks({
      page,
      limit: PLAYLIST_LIBRARY_PAGE_SIZE,
      // Any stable order works for a join; `createdAt` descending is the one the
      // table shows by default, so the index matches what the listener sees.
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    if (!result.success) {
      return result;
    }

    for (const track of result.body.tracks) {
      // A page boundary can repeat a row if the library grew mid-scan; the join
      // must not end up with two entries for one id.
      if (seen.has(track.id)) {
        continue;
      }
      seen.add(track.id);
      tracks.push(track);
    }

    if (!result.body.hasMore) {
      break;
    }
  }

  return ok(tracks);
}
