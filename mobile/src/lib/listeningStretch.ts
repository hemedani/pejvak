/**
 * The listening stretch — one continuous listen, spanning as many tracks as the
 * player got through without the listener deliberately changing track.
 *
 * The stored row is still *one track*: that is what the folder's "13 of 24
 * finished" counts, what decides where a track resumes, and what a track's own
 * play count is built from. A stretch is those rows read together, so nothing
 * here is stored and there is no second copy of a figure to keep in step.
 *
 * What separates the two is intent:
 *   - scrubbing inside a track changes nothing, so it does not cut a stretch;
 *   - automatic progression is not the listener's doing, so it does not either;
 *   - moving to another track by hand does, and starts a new one.
 */

import type { ContextType, LocalSession } from "@/lib/db/types";

export type ListeningStretch = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  /** The track the listener started on, and the second within it. */
  startTrackId: string;
  startPositionSec: number;
  /** The track they stopped on, and the second within it. */
  endTrackId: string;
  endPositionSec: number | null;
  /** How many tracks were heard without a break. */
  trackCount: number;
  listenedSec: number;
  playbackSpeed: number;
  /** Whether anything was scrubbed anywhere in the stretch. */
  seeked: boolean;
  /** The last track was played through to its end. */
  completed: boolean;
  interrupted: boolean;
  contextPlayId: string | null;
  contextType: ContextType | null;
  contextKey: string | null;
  /** Every member, in the order it was heard. */
  members: LocalSession[];
  /**
   * Heard from the very first second of the first track through to the end of
   * the last, with nothing skipped.
   *
   * Distinct from `completed`, which only says the last track ran out: a
   * listener who opened a book at chapter three and stopped when it ended has a
   * finished session and has not heard the book.
   */
  isComplete: boolean;
};

/** How a stretch ended, from the listener's point of view. */
export type StretchOutcome = "complete" | "finished" | "interrupted" | "open";

/**
 * Orders members by when they started.
 *
 * The input arrives ordered already, but a stretch is assembled from rows read
 * back over days — including, after a pull, from a device that never saw them —
 * so the first and last track must not depend on the query's ordering.
 */
function inListeningOrder(members: readonly LocalSession[]): LocalSession[] {
  return [...members].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Reads one stretch off its member sessions.
 *
 * Returns null for an empty group rather than inventing a stretch with no
 * tracks: a caller that has no members has no stretch.
 */
export function buildStretch(members: readonly LocalSession[]): ListeningStretch | null {
  const ordered = inListeningOrder(members);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) {
    return null;
  }

  const seeked = ordered.some((member) => member.seeked);
  const completed = last.completed;
  const endedAt = last.endedAt;

  return {
    id: first.stretchId,
    startedAt: first.startedAt,
    endedAt,
    startTrackId: first.trackId,
    startPositionSec: first.startPositionSec,
    endTrackId: last.trackId,
    endPositionSec: last.endPositionSec,
    trackCount: ordered.length,
    listenedSec: ordered.reduce((total, member) => total + member.durationListenedSec, 0),
    playbackSpeed: first.playbackSpeed,
    seeked,
    completed,
    interrupted: ordered.some((member) => member.interrupted),
    contextPlayId: first.contextPlayId,
    contextType: first.contextType,
    contextKey: first.contextKey,
    members: ordered,
    // All three, or it was not heard through: it has to start at the beginning
    // of its first track, reach the end of its last, and have no gap in between.
    isComplete: endedAt !== null && completed && !seeked && first.startPositionSec === 0,
  };
}

/**
 * Groups sessions into stretches, newest stretch first.
 *
 * A row with no group of its own is treated as a stretch of one, which is what
 * the v10 backfill made of every row written before stretches existed.
 */
export function groupSessionsIntoStretches(
  sessions: readonly LocalSession[],
): ListeningStretch[] {
  const groups = new Map<string, LocalSession[]>();
  for (const session of sessions) {
    const key = session.stretchId;
    const group = groups.get(key);
    if (group) {
      group.push(session);
    } else {
      groups.set(key, [session]);
    }
  }

  return [...groups.values()]
    .map((members) => buildStretch(members))
    .filter((stretch): stretch is ListeningStretch => stretch !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Whether the stretch covers more than one track. */
export function spansTracks(stretch: ListeningStretch): boolean {
  return stretch.trackCount > 1;
}

/** "1 track" / "3 tracks" — the caption that says a stretch was not one file. */
export function describeStretchTracks(stretch: ListeningStretch): string {
  return stretch.trackCount === 1 ? "1 track" : `${stretch.trackCount} tracks`;
}

export function describeStretchOutcome(stretch: ListeningStretch): StretchOutcome {
  if (stretch.isComplete) {
    return "complete";
  }
  if (stretch.endedAt === null) {
    return "open";
  }
  return stretch.completed ? "finished" : "interrupted";
}

/**
 * Which track tapping a stretch should reopen, and where inside it.
 *
 * Two answers, not one, because the second belongs to a different track: a
 * stretch heard through replays from the track it began on, and anything else
 * continues from the track it stopped on. Returning a bare number would let a
 * caller pair the start track with the end track's position, which lands the
 * listener minutes into a file they never reached.
 *
 * A stretch that ran to the end of its last track has nothing left to resume —
 * seeking to its end would finish that track the instant it started — so it
 * replays from the point it began. That reading matches `resumeTargetSec` for a
 * stretch of one, which is what the per-session card still uses.
 */
export function stretchResumeTarget(stretch: ListeningStretch): {
  trackId: string;
  positionSec: number;
} {
  if (stretch.completed) {
    return { trackId: stretch.startTrackId, positionSec: Math.max(0, stretch.startPositionSec) };
  }
  return {
    trackId: stretch.endTrackId,
    positionSec: Math.max(0, stretch.endPositionSec ?? stretch.startPositionSec),
  };
}

/** The resume position alone, for a caller that already knows which track. */
export function stretchResumeTargetSec(stretch: ListeningStretch): number {
  return stretchResumeTarget(stretch).positionSec;
}
