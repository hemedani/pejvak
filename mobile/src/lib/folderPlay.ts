/**
 * Folder playback planning.
 *
 * A folder is the one collection the listener did not have to build: they
 * already organised a term of lectures into `Physics/` with numbered files.
 * "Play this folder" therefore has to answer two questions without asking
 * anything back — *which* track, and *where* inside it — because the whole
 * point is that one tap continues the course.
 *
 * Everything here is pure. The screen supplies tracks and per-track progress;
 * this module decides order, entry point and start position.
 */

import type { TrackAvailability } from "@/lib/db/types";
import { orderFolderTracks, pickFolderStartIndex } from "@/lib/mediaFolders";

/**
 * Only the fields folder playback reasons about. Kept structural rather than
 * `LocalTrack` so the rules stay testable without building a full row — and so
 * the same helpers work for a folder preview built during an import scan.
 */
export type FolderPlayableTrack = {
  id: string;
  fileName: string | null;
  title: string;
  durationSec: number;
  discNumber: number | null;
  trackNumber: number | null;
  availability: TrackAvailability;
};

/**
 * What is known about one track's history. `finished` mirrors the
 * `completed = 1` count in `getFolderSummaries` exactly, so the "13 of 24
 * finished" on a folder card always agrees with where playback actually starts.
 */
export type FolderTrackProgress = {
  finished: boolean;
  resumeSec: number;
};

export type FolderPlayMode =
  /** Continue the folder: first unfinished track, at its saved position. */
  | "resume"
  /** Replay the folder from the top, from the beginning of track one. */
  | "restart"
  /** Only the tracks not yet finished — a "what's left" sprint. */
  | "unfinished"
  /** Same tracks, random order. */
  | "shuffle";

export type FolderPlayOptions = {
  mode?: FolderPlayMode;
  /**
   * Randomness source for `shuffle`. Injectable so the resulting order can be
   * asserted in a test; production passes nothing and gets `Math.random`.
   */
  random?: () => number;
};

export type FolderPlayPlan = {
  /** Tracks in playback order. */
  tracks: FolderPlayableTrack[];
  /** The same tracks as ids — the queue handed to the player. */
  queueIds: string[];
  /** Where in `tracks` playback begins. */
  startIndex: number;
  /** Position within the entry track, in whole seconds. */
  startPositionSec: number;
  /** Tracks left out of the queue because their file is gone. */
  missingCount: number;
};

/** Progress for a track nothing is known about: unplayed, no resume point. */
export const UNPLAYED_PROGRESS: FolderTrackProgress = { finished: false, resumeSec: 0 };

function isFinished(
  track: FolderPlayableTrack,
  progress: Record<string, FolderTrackProgress>,
): boolean {
  return progress[track.id]?.finished ?? false;
}

function resumeSecOf(
  track: FolderPlayableTrack | undefined,
  progress: Record<string, FolderTrackProgress>,
): number {
  return track ? (progress[track.id]?.resumeSec ?? 0) : 0;
}

/**
 * Fisher–Yates, on a copy. `Math.min` guards the upper bound: a custom source
 * that returns exactly 1 would otherwise index one past the end and leave a
 * hole in the queue.
 */
export function shuffleTracks<T>(tracks: readonly T[], random: () => number): T[] {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

function planFor(tracks: FolderPlayableTrack[], startIndex: number, startPositionSec: number, missingCount: number): FolderPlayPlan {
  return {
    tracks,
    queueIds: tracks.map((track) => track.id),
    startIndex,
    startPositionSec,
    missingCount,
  };
}

/**
 * Builds the queue for one folder.
 *
 * Tracks whose bytes are unreachable are dropped from the queue rather than
 * queued to fail: a folder play is meant to run unattended, and an error
 * mid-lecture is worse than a short gap. The count comes back so the UI can
 * say so out loud.
 */
export function buildFolderPlan(
  tracks: readonly FolderPlayableTrack[],
  progress: Record<string, FolderTrackProgress>,
  options: FolderPlayOptions = {},
): FolderPlayPlan {
  const mode = options.mode ?? "resume";
  const missingCount = tracks.filter((track) => track.availability === "missing").length;
  const ordered = orderFolderTracks(tracks.filter((track) => track.availability !== "missing"));

  if (ordered.length === 0) {
    return planFor([], 0, 0, missingCount);
  }

  if (mode === "shuffle") {
    const shuffled = shuffleTracks(ordered, options.random ?? Math.random);
    // Shuffling is a deliberate "surprise me": seeking into the middle of
    // whatever lands first would defeat it.
    return planFor(shuffled, 0, 0, missingCount);
  }

  if (mode === "unfinished") {
    const remaining = ordered.filter((track) => !isFinished(track, progress));
    // Nothing left to finish means the folder is done. Falling through to a
    // normal resume replays it from the top, which beats a dead button.
    if (remaining.length > 0) {
      return planFor(remaining, 0, resumeSecOf(remaining[0], progress), missingCount);
    }
  }

  if (mode === "restart") {
    return planFor(ordered, 0, 0, missingCount);
  }

  const startIndex = pickFolderStartIndex(ordered.map((track) => isFinished(track, progress)));
  return planFor(ordered, startIndex, resumeSecOf(ordered[startIndex], progress), missingCount);
}

/** Finished share of a folder, clamped to 0–1. Empty folders report 0. */
export function folderProgressRatio(finishedCount: number, trackCount: number): number {
  if (trackCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, finishedCount / trackCount));
}

/**
 * One line describing a folder's state.
 *
 * "0 of 24 finished" reads like a failure, and "24 of 24 finished" is a
 * mouthful, so both ends get their own phrasing and the middle keeps the
 * literal count.
 */
export function describeFolderProgress(finishedCount: number, trackCount: number): string {
  if (trackCount <= 0) {
    return "Empty folder";
  }
  const tracks = `${trackCount} track${trackCount === 1 ? "" : "s"}`;
  if (finishedCount <= 0) {
    return tracks;
  }
  if (finishedCount >= trackCount) {
    return `All ${tracks} finished`;
  }
  return `${finishedCount} of ${trackCount} finished`;
}

/** "2 files missing", or null when every file is where we left it. */
export function describeMissing(missingCount: number): string | null {
  if (missingCount <= 0) {
    return null;
  }
  return `${missingCount} file${missingCount === 1 ? "" : "s"} missing`;
}
