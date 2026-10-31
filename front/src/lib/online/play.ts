/**
 * Starting a collection: the one place an online shelf becomes a queue.
 *
 * Three things happen here, in this order, and the order is the design:
 *
 *   1. **The tracks are known before the queue is built.** A caller may already
 *      hold them (the collection page does), and one that does not — a Continue
 *      card, a play control inside a track row — asks the source once. A queue
 *      must know its own length: `playQueueAt` opens the run with
 *      `trackCount = queue.length`, and a one-track queue would record a
 *      nine-part course as a single episode.
 *   2. **The queue carries ids, never a URL.** `playerQueueFromOnline` hashes
 *      each item's identity and keeps `sourceId`/`externalId`/`collectionKey`;
 *      the address is resolved by the player immediately before load.
 *   3. **`lastOpenedAt` is written after playback has started**, fire and forget.
 *      It is what puts the collection on the listener's Continue shelf on their
 *      other device even if they never pressed the heart — and a failed save
 *      must never stop the audio they just asked for.
 *
 * The resume position is deliberately applied here rather than inside the
 * player: a live stream has no position to resume, and the only place that knows
 * the source is live is the source descriptor.
 */

import { getOnlineCollection } from "@/app/actions/online/get-online-collection";
import { saveOnlineCollection } from "@/app/actions/online/save-online-collection";
import { findSource } from "@/lib/online/catalogue";
import { playerQueueFromOnline } from "@/lib/online/player-track";
import { onlineProblemMessage, problemCodeFor } from "@/lib/online/problems";
import type { OnlineCollection, OnlineTrack } from "@/lib/online/types";
import { playQueueAt } from "@/lib/player/controller";

/**
 * A collection as a control needs it.
 *
 * Narrower than `OnlineCollection` on purpose: a Continue card may name a
 * collection whose saved row the listener deleted, and it has no artwork or
 * subtitle to offer. Everything here is something the player or the save action
 * genuinely reads.
 */
export type PlayableCollection = Pick<
  OnlineCollection,
  "key" | "sourceId" | "externalId" | "title" | "artworkUrl"
> & {
  /** Empty when the row predates the language being known; the save is skipped. */
  languageCode: string;
  trackCount: number;
  subtitle?: string | null;
  pageUrl?: string | null;
};

export type PlayResult = { ok: true } | { ok: false; message: string };

/**
 * Play `tracks[index]` as the start of the whole collection.
 *
 * `index` is 0-based into the collection, not a track's own `order` — the two
 * differ the moment a source numbers its parts from anything but one.
 */
export async function playOnlineCollection(input: {
  collection: PlayableCollection;
  /** Already-loaded tracks. Omit to have the source asked for them. */
  tracks?: readonly OnlineTrack[];
  index?: number;
  startPositionSec?: number;
}): Promise<PlayResult> {
  const source = findSource(input.collection.sourceId);
  if (!source) {
    return { ok: false, message: "این منبع شناخته نشد." };
  }

  let tracks = input.tracks ? [...input.tracks] : null;
  if (tracks === null) {
    const result = await getOnlineCollection({
      sourceId: input.collection.sourceId,
      externalId: input.collection.externalId,
    });
    if (!result.success) {
      return { ok: false, message: onlineProblemMessage(problemCodeFor(result.error)) };
    }
    tracks = result.body.tracks;
  }

  if (tracks.length === 0) {
    return { ok: false, message: "این مجموعه قطعهٔ قابل‌پخشی ندارد." };
  }

  const index = Math.max(0, Math.min(input.index ?? 0, tracks.length - 1));
  // A live stream is joined, not resumed: a stored position would be a position
  // in a broadcast that has already moved on.
  const startPositionSec = source.live
    ? 0
    : Math.max(0, Math.round(input.startPositionSec ?? 0));

  const queue = await playerQueueFromOnline(source, input.collection, tracks);

  await playQueueAt(queue, index, {
    context: { type: "online", key: input.collection.key, title: input.collection.title },
    startPositionSec,
  });

  void rememberOpened(input.collection, tracks.length);
  return { ok: true };
}

/**
 * Put the collection on the shelf, or move it back to the top of it.
 *
 * Never awaited by the caller and never allowed to throw: the listener pressed
 * play, and the audio has already started. `trackCount` is the opened count, not
 * the catalogue's — this is one of the three moments (save, favourite, play)
 * where the real figure is allowed to replace an unknown zero.
 */
async function rememberOpened(
  collection: PlayableCollection,
  trackCount: number,
): Promise<void> {
  if (!collection.languageCode) {
    return;
  }
  try {
    await saveOnlineCollection({
      collection: {
        sourceId: collection.sourceId,
        externalId: collection.externalId,
        title: collection.title,
        languageCode: collection.languageCode,
        trackCount,
        ...(collection.subtitle ? { subtitle: collection.subtitle } : {}),
        ...(collection.artworkUrl ? { artworkUrl: collection.artworkUrl } : {}),
        ...(collection.pageUrl ? { pageUrl: collection.pageUrl } : {}),
      },
      lastOpenedAt: Date.now(),
    });
  } catch {
    // A shelf that did not record the visit is a missing Continue card, not a
    // failed playback. There is nothing for the listener to act on.
  }
}
