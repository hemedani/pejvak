"use server";

/**
 * Register a streamed track before its first session or note is sent.
 *
 * Registration is idempotent on the server: the same user and `contentHash`
 * return the existing row. The web player never registers a local track — those
 * rows were created on the phone.
 *
 * Fire-and-forget on first play; the sync runner calls it again for a note made
 * before the registration finished. A failure keeps the pending row and every
 * dependent session queued (`lib/player/storage.ts`).
 */

import { callAct } from "@/lib/call-act";
import { parseRegisteredTrackId } from "@/lib/player/wire";
import type { PendingTrack } from "@/lib/player/types";
import { fail, ok, type ActResult } from "@/lib/result";

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function registerTrackForPlayer(track: PendingTrack): Promise<ActResult<string | null>> {
  if (!track.contentHash || !track.title) {
    return fail("validation", "A track needs a content hash and a title.");
  }
  if (!track.sourceId || !track.externalId) {
    return fail("validation", "An online track needs its source and external id.");
  }

  const result = await callAct("track", "registerTrack", {
    set: {
      title: track.title,
      contentHash: track.contentHash,
      durationSec: nonNegativeInt(track.durationSec),
      fileSizeBytes: nonNegativeInt(track.fileSizeBytes),
      isAudiobook: track.isAudiobook,
      origin: "online",
      sourceId: track.sourceId,
      externalId: track.externalId,
      ...(track.collectionKey === null ? {} : { collectionKey: track.collectionKey }),
      ...(track.collectionTitle === null ? {} : { collectionTitle: track.collectionTitle }),
      ...(track.artworkUrl === null ? {} : { artworkUrl: track.artworkUrl }),
      ...(track.author === null ? {} : { author: track.author }),
      ...(track.narrator === null ? {} : { narrator: track.narrator }),
    },
    get: { _id: 1 },
  });

  if (!result.success) {
    return result;
  }

  return ok(parseRegisteredTrackId(result.body));
}
