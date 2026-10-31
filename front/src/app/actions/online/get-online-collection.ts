"use server";

/**
 * One collection, opened: its metadata and its playable rows.
 *
 * A source that cannot state a collection's size before opening it reports
 * `trackCount: 0` (the archive's search index has no per-item count, and
 * aminikhaah's catalogue omits it). Opening the collection is the moment the
 * real figure is known, so the returned copy carries the track count for
 * **display**. It is never written back here: a page render must not mutate,
 * and the row is updated when the listener saves, favourites or plays.
 */

import { toOnlineFailure } from "@/lib/online/errors";
import { getCollection, getTracks, requireSource } from "@/lib/online/server";
import { OnlineSourceError, type OnlineCollection, type OnlineTrack } from "@/lib/online/types";
import { fail, ok, type ActResult } from "@/lib/result";

export type OpenedCollection = {
  collection: OnlineCollection;
  tracks: OnlineTrack[];
};

function denseOrder(tracks: readonly OnlineTrack[]): OnlineTrack[] {
  return tracks.map((track, index) => ({ ...track, order: index + 1 }));
}

export async function getOnlineCollection(input: {
  sourceId: string;
  externalId: string;
}): Promise<ActResult<OpenedCollection>> {
  if (input.sourceId.trim().length === 0 || input.externalId.trim().length === 0) {
    return fail("validation", "A collection needs both its source and its id.", {
      code: "not_found",
    });
  }

  try {
    requireSource(input.sourceId);

    const collection = await getCollection(input.sourceId, input.externalId);
    if (!collection) {
      throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
    }

    const tracks = denseOrder(await getTracks(input.sourceId, input.externalId));

    return ok({
      collection:
        collection.trackCount > 0 ? collection : { ...collection, trackCount: tracks.length },
      tracks,
    });
  } catch (error) {
    return toOnlineFailure(error);
  }
}
