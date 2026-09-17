import type { LocalTrack, PlaylistItem } from "@/lib/db/types";
import {
  buildFolderPlan,
  type FolderPlayMode,
  type FolderPlayPlan,
  type FolderTrackProgress,
} from "@/lib/folderPlay";
import { folderNameFromKey, orderFolderTracks } from "@/lib/mediaFolders";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

export type FolderDetailData = {
  folderKey: string;
  /** Display name: the granted folder's name, else the key's last segment. */
  name: string;
  /** Tracks already in playback order, so every consumer agrees on the order. */
  tracks: LocalTrack[];
  progress: Record<string, FolderTrackProgress>;
  finishedCount: number;
  totalDurationSec: number;
};

/**
 * Loads a folder with its tracks in playback order and per-track progress.
 *
 * Ordering happens here rather than in a screen so the list the listener sees
 * and the queue the player receives come from the same call — a screen that
 * sorted its own copy could show `lecture 2` above `lecture 10` while the queue
 * played them the other way round.
 */
async function loadFolder(folderKey: string): Promise<FolderDetailData> {
  const [rawTracks, progress, folders] = await Promise.all([
    LocalDBService.getTracksByFolder(folderKey),
    LocalDBService.getFolderTrackProgress(folderKey),
    LocalDBService.getFolders(),
  ]);
  const tracks = orderFolderTracks(rawTracks);
  return {
    folderKey,
    name: folders.find((folder) => folder.key === folderKey)?.name ?? folderNameFromKey(folderKey),
    tracks,
    progress,
    finishedCount: tracks.filter((track) => progress[track.id]?.finished ?? false).length,
    totalDurationSec: tracks.reduce((total, track) => total + track.durationSec, 0),
  };
}

/** A play plan for an already-loaded folder. */
function planFolder(
  data: Pick<FolderDetailData, "tracks" | "progress">,
  mode: FolderPlayMode = "resume",
): FolderPlayPlan {
  return buildFolderPlan(data.tracks, data.progress, { mode });
}

/**
 * The same queue, entered at one specific track — what tapping a row inside a
 * folder means. The queue still spans the whole folder, so the next track after
 * the tapped one is the next lecture rather than the end of playback.
 *
 * Returns null for a track that is not in the queue at all, which is how a row
 * whose file has gone missing opts out.
 */
function planFromTrack(
  data: Pick<FolderDetailData, "tracks" | "progress">,
  trackId: string,
): FolderPlayPlan | null {
  const base = planFolder(data, "resume");
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
 * Starts an already-built plan and records the folder as played.
 *
 * The two steps belong together: a folder that plays without touching
 * `last_played_at` would never rise to the top of the folder list, and a folder
 * touched without playing would lie about it. Returns the entry track id, or
 * null when there is nothing playable.
 */
async function startPlan(data: FolderDetailData, plan: FolderPlayPlan): Promise<string | null> {
  const entryId = plan.queueIds[plan.startIndex];
  if (!entryId) {
    return null;
  }
  await TrackPlayerService.playQueueAt(plan.queueIds, plan.startIndex, plan.startPositionSec);
  await LocalDBService.touchFolderPlayed(data.folderKey, data.name);
  return entryId;
}

/**
 * Everything that acts on a folder.
 *
 * Both the folder card on the Library screen and the folder's own screen need to
 * start, shuffle and queue the same collection. Keeping the sequence in one
 * place (load → order → plan → play, plus the `last_played_at` touch) means the
 * two screens cannot drift into playing a folder two different ways.
 *
 * Plain module functions rather than methods on an object: destructuring
 * `const { play } = FolderService` is a natural thing for a screen to do, and
 * `this`-bound methods would break the moment it does.
 */
export const FolderService = {
  load: loadFolder,
  plan: planFolder,
  planFromTrack,
  startPlan,

  /**
   * Loads a folder and starts it. Returns the track id playback entered on, so
   * the caller can navigate to the player — or null when nothing is playable.
   */
  async play(folderKey: string, mode: FolderPlayMode = "resume"): Promise<string | null> {
    const data = await loadFolder(folderKey);
    return startPlan(data, planFolder(data, mode));
  },

  /** Appends a folder to the queue without interrupting what is playing. */
  async enqueue(folderKey: string, mode: FolderPlayMode = "resume"): Promise<number> {
    const plan = planFolder(await loadFolder(folderKey), mode);
    TrackPlayerService.enqueue(plan.queueIds);
    return plan.queueIds.length;
  },

  /**
   * Copies a folder's order into a real playlist, so the listener can then edit
   * it, reorder it, or keep it after the files move.
   *
   * Written in one `updatePlaylist` rather than N `addTrack` calls: each of those
   * re-reads the playlist and rewrites the whole item list, which is quadratic
   * on a 200-file lecture folder.
   */
  async saveAsPlaylist(folderKey: string, title?: string): Promise<string | null> {
    const data = await loadFolder(folderKey);
    if (data.tracks.length === 0) {
      return null;
    }
    const playlist = await PlaylistService.create(title ?? data.name);
    const items: PlaylistItem[] = data.tracks.map((track, index) => ({
      trackId: track.id,
      order: index,
    }));
    await LocalDBService.updatePlaylist(playlist.id, { items });
    return playlist.id;
  },
};
