/**
 * An online collection as a unit of playback.
 *
 * The same job `FolderService` does for a folder and `PlaylistService` does for
 * a playlist: load the collection, decide the order, decide where playback
 * enters, start it, and open a run so the attempt is recorded. A streamed
 * course is a collection like any other, and this module is the only place that
 * says so out loud.
 *
 * Two things are deliberately borrowed rather than re-invented:
 *
 *   1. **The planner is `buildFolderPlan`.** An online course *is* a numbered
 *      folder — the source gives each episode a position, the rows carry it as
 *      `track_number`, and the four modes (continue, restart, unfinished only,
 *      shuffle) mean exactly the same thing here. A second planner would be a
 *      second definition of "continue".
 *   2. **The run is `context_plays` with `context_type = 'online'`.** So History,
 *      Stats and the context-history sheet already work for streamed audio with
 *      no change at all — which is what the product asked for.
 */

import type {
  ContextStats,
  LocalOnlineCollection,
  LocalTrack,
} from "@/lib/db/types";
import {
  buildFolderPlan,
  folderProgressRatio,
  type FolderPlayMode,
  type FolderPlayPlan,
  type FolderTrackProgress,
} from "@/lib/folderPlay";
import type { PlaybackContext } from "@/lib/playbackContext";
import { LocalDBService } from "@/services/LocalDBService";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";
import * as DownloadService from "@/services/DownloadService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

export type OnlineCollectionData = {
  meta: LocalOnlineCollection;
  /** Already in the source's own order, so the list and the queue agree. */
  tracks: LocalTrack[];
  /** Per-track "finished" and "resume at", from this listener's own sessions. */
  progress: Record<string, FolderTrackProgress>;
  finishedCount: number;
  totalDurationSec: number;
  /** How often the collection has been run, and how often through. */
  stats: ContextStats;
  /** The source was unreachable; these rows are what the device already had. */
  fromCache: boolean;
};

/**
 * Load a collection ready to be played.
 *
 * `OnlineCatalogService.loadCollection` owns the network question (fresh rows,
 * or what is on the device when the source cannot be reached); this adds the two
 * things only playback needs — where the listener got to, and how often they
 * have been here — read in one round trip rather than one per row.
 */
export async function load(key: string): Promise<OnlineCollectionData> {
  const { meta, tracks, fromCache } = await OnlineCatalogService.loadCollection(key);
  const [progress, stats] = await Promise.all([
    LocalDBService.getCollectionTrackProgress(key),
    LocalDBService.getContextStats("online", key),
  ]);

  return {
    meta,
    tracks,
    progress,
    finishedCount: tracks.filter((track) => progress[track.id]?.finished ?? false).length,
    totalDurationSec: tracks.reduce((total, track) => total + track.durationSec, 0),
    stats,
    fromCache,
  };
}

/**
 * The three things a screen has in hand once it has loaded a collection.
 *
 * Declared as a narrowing of `OnlineCollectionData` rather than as a second
 * shape, so a screen can hold the loaded pieces and pass them straight to the
 * verbs below without either side having to build the other's object — and so
 * there is no way for the planner and the starter to disagree about which
 * collection they are acting on.
 */
export type PlayableCollection = Pick<OnlineCollectionData, "meta" | "tracks" | "progress">;

/** A play plan for an already-loaded collection. */
export function plan(
  data: Pick<OnlineCollectionData, "tracks" | "progress">,
  mode: FolderPlayMode = "resume",
): FolderPlayPlan {
  return buildFolderPlan(data.tracks, data.progress, { mode });
}

/**
 * The same queue, entered at one specific episode.
 *
 * The queue still spans the whole collection, so the next episode after the
 * tapped one is the next episode — not the end of playback. Returns null for a
 * track that is not in the queue at all, which is how a row whose episode has
 * left the source opts out.
 */
export function planFromTrack(
  data: Pick<OnlineCollectionData, "tracks" | "progress">,
  trackId: string,
): FolderPlayPlan | null {
  const base = plan(data, "resume");
  const startIndex = base.queueIds.indexOf(trackId);
  if (startIndex < 0) {
    return null;
  }
  return {
    ...base,
    startIndex,
    startPositionSec: data.progress[trackId]?.resumeSec ?? 0,
  };
}

/**
 * The collection an online queue belongs to.
 *
 * `key` is the `sourceId:externalId` pair and not the title, because the key is
 * what survives a rename on the source and what a stored run resolves back to a
 * queue; the title rides along only so the player can name the collection
 * without a query.
 */
export function contextFor(meta: Pick<LocalOnlineCollection, "key" | "title">): PlaybackContext {
  return { type: "online", key: meta.key, title: meta.title };
}

/**
 * Start an already-built plan and record that the collection was opened.
 *
 * The two steps belong together: a collection that plays without touching
 * `last_opened_at` would sink to the bottom of the listener's own list, and one
 * touched without playing would lie about it. The run itself is opened by
 * `playQueueAt` — passing the context is what makes this a *run* rather than a
 * loose queue, and what lets History offer to continue it later.
 *
 * Returns the episode playback entered on, or null when nothing is playable.
 */
export async function startPlan(
  data: Pick<OnlineCollectionData, "meta">,
  next: FolderPlayPlan,
): Promise<string | null> {
  const entryId = next.queueIds[next.startIndex];
  if (!entryId) {
    return null;
  }
  await TrackPlayerService.playQueueAt(
    next.queueIds,
    next.startIndex,
    next.startPositionSec,
    contextFor(data.meta),
  );
  await OnlineCatalogService.markOpened(data.meta.key);
  return entryId;
}

/** Load a collection and start it. Returns the entry track id, or null. */
export async function play(
  key: string,
  mode: FolderPlayMode = "resume",
): Promise<string | null> {
  const data = await load(key);
  return startPlan(data, plan(data, mode));
}

/** Append a collection to the queue without interrupting what is playing. */
export async function enqueue(key: string, mode: FolderPlayMode = "resume"): Promise<number> {
  const next = plan(await load(key), mode);
  TrackPlayerService.enqueue(next.queueIds);
  return next.queueIds.length;
}

/** Finished share of a collection, for a card's progress bar. */
export function progressRatio(data: Pick<OnlineCollectionData, "finishedCount" | "tracks">): number {
  return folderProgressRatio(data.finishedCount, data.tracks.length);
}

/**
 * Everything that acts on an online collection.
 *
 * Composed rather than exported one name at a time, for the same reason
 * `FolderService` is: a screen that already holds `OnlineCollectionService` has
 * one import for play, queue, download, save and forget, and the delegated
 * halves cannot drift into being imported from two different places.
 *
 * Downloads and favourites are re-exported rather than re-implemented — this
 * module owns the *collection* as a unit of playback, and pretending to own the
 * queue's retry policy as well would be a second implementation of it.
 */
export const OnlineCollectionService = {
  load,
  plan,
  planFromTrack,
  contextFor,
  startPlan,
  play,
  enqueue,
  progressRatio,

  download: DownloadService.startDownload,
  cancelDownload: DownloadService.cancelDownload,
  retryDownload: DownloadService.retryDownload,
  downloadSummary: DownloadService.getSummary,
  subscribeToDownloads: DownloadService.subscribe,

  setFavorite: OnlineCatalogService.setFavorite,
  remove: OnlineCatalogService.removeCollection,
  save: OnlineCatalogService.saveCollection,
  markOpened: OnlineCatalogService.markOpened,
};
