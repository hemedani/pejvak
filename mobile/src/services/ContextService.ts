/**
 * Collections as a unit of playback.
 *
 * A *run* (`context_plays`) is one attempt at listening through a folder or a
 * playlist. Everything that has to turn a remembered run back into playback
 * lives here, so the History screen, the collection headers and the player's
 * "open the folder" control all resolve a collection the same way — and so
 * there is exactly one place where "the playlist changed since you last heard
 * it" has to be handled.
 */

import type { ContextStats, ContextType, LocalContextPlay } from "@/lib/db/types";
import {
  contextRouteTarget,
  runResumeTargetSec,
  type PlaybackContext,
} from "@/lib/playbackContext";
import { FolderService } from "@/services/FolderService";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

/** The two halves that identify a collection, without its display title. */
type ContextRef = { type: ContextType; key: string };

/** Where tapping a collection should navigate, as route data. */
export function routeFor(context: ContextRef) {
  return contextRouteTarget(context);
}

/** The identifying halves of a stored run. */
function refOf(run: Pick<LocalContextPlay, "contextType" | "contextKey">): ContextRef {
  return { type: run.contextType, key: run.contextKey };
}

/**
 * The collection's queue *as it is now*.
 *
 * A run stores a key, not a queue: a folder can gain a lecture and a playlist
 * can be reordered between two listens, and resuming into a stale snapshot would
 * play tracks the listener has since removed. Resolving fresh also means a
 * collection that has been emptied or deleted reports `null` here rather than
 * producing a queue of dangling ids.
 */
async function resolveQueue(
  context: ContextRef,
): Promise<{ ids: string[]; context: PlaybackContext } | null> {
  if (context.type === "folder") {
    const data = await FolderService.load(context.key);
    const plan = FolderService.plan(data, "resume");
    if (plan.queueIds.length === 0) {
      return null;
    }
    return { ids: plan.queueIds, context: FolderService.contextFor(data) };
  }

  const detail = await PlaylistService.loadDetail(context.key);
  if (!detail || detail.tracks.length === 0) {
    return null;
  }
  return {
    ids: detail.tracks.map((track) => track.id),
    context: PlaylistService.contextFor(detail.playlist),
  };
}

/**
 * Starts a collection at a chosen track and position.
 *
 * This is what both "continue this folder" and "resume the session I tapped"
 * are built on: the collection becomes the queue — so the next track after this
 * one is the next lecture rather than the end of playback — and the run that
 * records the attempt is opened or re-entered by `playQueueAt`.
 *
 * Returns the track playback entered on, or null when the collection is gone or
 * no longer contains that track.
 */
async function startAt(
  context: ContextRef,
  trackId: string,
  positionSec: number,
): Promise<string | null> {
  const resolved = await resolveQueue(context);
  if (!resolved) {
    return null;
  }
  const index = resolved.ids.indexOf(trackId);
  if (index < 0) {
    return null;
  }
  await TrackPlayerService.playQueueAt(resolved.ids, index, positionSec, resolved.context);
  return trackId;
}

/**
 * Picks up a run where it was left.
 *
 * The run remembers *which track* it was on, and that is what is used — not the
 * index. A folder sorted by name can gain a file, which shifts every index after
 * it; the track id does not move. The index is only a fallback for a run whose
 * track has since left the collection, and it is clamped, because a shortened
 * collection would otherwise resume past its end.
 */
async function resume(run: LocalContextPlay): Promise<string | null> {
  const resolved = await resolveQueue(refOf(run));
  if (!resolved) {
    return null;
  }

  // A run heard through has nothing left to continue: replaying it from the
  // track it ended on would be a one-track queue that finishes the instant it
  // starts, so a finished run starts the collection over instead.
  if (run.completed) {
    await TrackPlayerService.playQueueAt(resolved.ids, 0, 0, resolved.context);
    return resolved.ids[0] ?? null;
  }

  const remembered = run.lastTrackId ? resolved.ids.indexOf(run.lastTrackId) : -1;
  const index =
    remembered >= 0 ? remembered : Math.min(Math.max(0, run.lastIndex), resolved.ids.length - 1);
  const positionSec = remembered >= 0 ? runResumeTargetSec(run) : 0;
  await TrackPlayerService.playQueueAt(resolved.ids, index, positionSec, resolved.context);
  return resolved.ids[index] ?? null;
}

/** One collection's runs, newest first. Includes the run still open. */
function runs(contextType: ContextType, contextKey: string, limit = 20) {
  return LocalDBService.getContextPlaysByKey(contextType, contextKey, limit);
}

/** How often a collection has been played, and how often finished. */
function stats(contextType: ContextType, contextKey: string): Promise<ContextStats> {
  return LocalDBService.getContextStats(contextType, contextKey);
}

/** Closed runs across every collection, newest first. */
function history(limit = 200) {
  return LocalDBService.getContextPlaysForHistory(limit);
}

export const ContextService = {
  routeFor,
  refOf,
  resolveQueue,
  startAt,
  resume,
  runs,
  stats,
  history,
};
