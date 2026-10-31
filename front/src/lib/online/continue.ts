/**
 * The Continue shelf: the collections a listener started and has not finished.
 *
 * Pure, and deliberately ignorant of where its inputs came from. Two reads feed
 * it — the runs (`getMyContexts`) and the saved shelf (`getMyOnlineCollections`)
 * — and the rules below are the whole of the join:
 *
 *   · A run outlives the collection it names. If the listener removed the
 *     saved row, the run still knows where they were, so the item renders from
 *     the run's own `contextTitle` and `collection` is `null`.
 *   · The run is authoritative for **where**; the saved row only supplies the
 *     artwork and grouping line. Sizes can differ between the two because the
 *     collection changed upstream, and resuming from the run's index is the
 *     only answer that matches what was actually heard.
 *   · One card per collection: the newest run, not one per attempt. The act
 *     returns newest-first and that order is kept, never re-sorted.
 *   · Only partial runs. A finished course is not "continue", even if its
 *     `endedAt` is the most recent thing in the table.
 */

import { runResumeTargetSec } from "@/lib/player/playbackContext";
import { isPartialRun } from "@/lib/player/playbackContext";
import { parseCollectionKey } from "@/lib/online/catalogue";
import type { OnlineCollection, OnlineCollectionRow, PlaybackContextRow } from "@/lib/online/types";

export type ContinueItem = {
  key: string;
  sourceId: string;
  externalId: string;
  title: string;
  trackCount: number;
  finishedCount: number;
  lastIndex: number;
  lastPositionSec: number;
  resumeTargetSec: number;
  run: PlaybackContextRow;
  collection: OnlineCollectionRow | null;
};

/**
 * The runs worth resuming, newest first, one per collection.
 *
 * `limit` is a display bound, not a page: the caller has already asked the
 * backend for a little more than it intends to draw, so the shelf has a buffer
 * to drop malformed keys from without going short.
 */
export function buildContinueItems(
  runs: readonly PlaybackContextRow[],
  collections: readonly OnlineCollectionRow[],
  limit = 12,
): ContinueItem[] {
  const savedByKey = new Map(collections.map((collection) => [collection.key, collection]));
  const seen = new Set<string>();
  const items: ContinueItem[] = [];

  for (const run of runs) {
    if (run.contextType !== "online" || run.endedAt === null) {
      continue;
    }
    if (!isPartialRun(run) || seen.has(run.contextKey)) {
      continue;
    }

    const parsed = parseCollectionKey(run.contextKey);
    if (!parsed) {
      continue;
    }
    seen.add(run.contextKey);

    items.push({
      key: run.contextKey,
      sourceId: parsed.sourceId,
      externalId: parsed.externalId,
      // The run's own title, because the collection may be gone from the shelf.
      title: run.contextTitle || savedByKey.get(run.contextKey)?.title || "مجموعه",
      trackCount: run.trackCount,
      finishedCount: run.finishedCount,
      lastIndex: Math.max(0, run.lastIndex),
      lastPositionSec: Math.max(0, run.lastPositionSec),
      resumeTargetSec: runResumeTargetSec(run),
      run,
      collection: savedByKey.get(run.contextKey) ?? null,
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

/**
 * A Continue item as the shelf card needs it.
 *
 * The saved row wins wherever it exists — it carries the artwork, the subtitle
 * and the language the card prints. Where it does not (the listener removed it
 * and the run outlived it), the run supplies the title and the size, and
 * everything a card would decorate with is `null`.
 *
 * `languageCode` is empty in that second case, and that is deliberate: it is not
 * unknown-because-empty, it is unknown, and the controls that need it (saving,
 * favouriting) check for it rather than writing an empty string into a row.
 */
export function collectionForContinueItem(item: ContinueItem): OnlineCollection {
  if (item.collection) {
    return item.collection;
  }
  return {
    key: item.key,
    sourceId: item.sourceId,
    externalId: item.externalId,
    title: item.title,
    subtitle: null,
    artworkUrl: null,
    trackCount: item.trackCount,
    languageCode: "",
    pageUrl: null,
  };
}
