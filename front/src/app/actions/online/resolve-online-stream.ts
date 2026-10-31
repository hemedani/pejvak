"use server";

/**
 * The server half of the player's `StreamResolver`.
 *
 * The queue stores ids, never a URL: a signed address expires between opening a
 * collection and reaching its tenth track. This action re-reads the collection
 * through the short-lived cache and hands back the adapter's current address
 * immediately before the audio element loads it.
 *
 * It does not `HEAD` the URL. A media element is the authority on whether an
 * address plays; a probe would be a second request that can disagree with the
 * one that matters.
 *
 * The URL is never logged — a signed URL is a bearer token for the source's
 * bytes.
 */

import { parseCollectionKey } from "@/lib/online/catalogue";
import { toOnlineFailure } from "@/lib/online/errors";
import { getTracks } from "@/lib/online/server";
import { OnlineSourceError } from "@/lib/online/types";
import { fail, ok, type ActResult } from "@/lib/result";

export type ResolvedStream = {
  streamUrl: string;
  durationSec: number;
};

export async function resolveOnlineStream(input: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}): Promise<ActResult<ResolvedStream>> {
  const parsed = parseCollectionKey(input.collectionKey);
  if (!parsed || parsed.sourceId !== input.sourceId) {
    return fail("validation", "The collection key does not belong to that source.", {
      code: "not_found",
    });
  }
  try {
    const tracks = await getTracks(input.sourceId, parsed.externalId);
    const track = tracks.find((entry) => entry.externalId === input.externalId);
    if (!track) {
      throw new OnlineSourceError("That track is no longer in the collection.", "not_found");
    }
    return ok({
      streamUrl: track.streamUrl,
      durationSec: Math.max(0, Math.round(track.durationSec)),
    });
  } catch (error) {
    return toOnlineFailure(error);
  }
}
