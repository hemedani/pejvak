import type { LocalAnnotation, LocalSession } from "@/lib/db/types";
import { dayKey } from "@/lib/history";

export type TrackStats = {
  /** Finalized sessions only. */
  playCount: number;
  totalListenTimeSec: number;
  /** Most recent activity, including an open session's start. */
  lastPlayedAt: number | null;
  /** Completed / finalized, 0–1. */
  completionRate: number;
  annotationCount: number;
};

export function computeTrackStats(
  sessions: LocalSession[],
  annotations: LocalAnnotation[],
): TrackStats {
  const finalized = sessions.filter((session) => session.endedAt !== null);
  const completedCount = finalized.filter((session) => session.completed).length;

  let lastPlayedAt: number | null = null;
  for (const session of sessions) {
    const at = session.endedAt ?? session.startedAt;
    if (lastPlayedAt === null || at > lastPlayedAt) {
      lastPlayedAt = at;
    }
  }

  return {
    playCount: finalized.length,
    totalListenTimeSec: finalized.reduce(
      (total, session) => total + session.durationListenedSec,
      0,
    ),
    lastPlayedAt,
    completionRate: finalized.length === 0 ? 0 : completedCount / finalized.length,
    annotationCount: annotations.length,
  };
}

/**
 * The shape of a track's listening, for the details panel.
 *
 * Deliberately a second reading of the same sessions rather than more fields on
 * `TrackStats`: that one answers "how much", this one answers "how", and a
 * screen that wants a single number should not pay for the distribution.
 */
export type SessionSummary = {
  /** Sessions that have ended. An open session has nothing to average yet. */
  finishedCount: number;
  completedCount: number;
  interruptedCount: number;
  /** A session still being written — the track is playing right now. */
  openCount: number;
  totalListenedSec: number;
  longestSec: number;
  /** Mean wall-clock time per finished session. */
  averageSec: number;
  firstStartedAt: number | null;
  lastActivityAt: number | null;
  /** Distinct calendar days with any listening. */
  daysListened: number;
  /** Every playback speed this track has been heard at, ascending. */
  speeds: number[];
};

export function summariseSessions(sessions: LocalSession[]): SessionSummary {
  const finished = sessions.filter((session) => session.endedAt !== null);
  const completedCount = finished.filter((session) => session.completed).length;
  const interruptedCount = finished.filter((session) => session.interrupted).length;
  const totalListenedSec = finished.reduce(
    (total, session) => total + session.durationListenedSec,
    0,
  );

  let longestSec = 0;
  let firstStartedAt: number | null = null;
  let lastActivityAt: number | null = null;
  const days = new Set<string>();
  const speeds = new Set<number>();

  for (const session of sessions) {
    if (session.durationListenedSec > longestSec) {
      longestSec = session.durationListenedSec;
    }
    if (firstStartedAt === null || session.startedAt < firstStartedAt) {
      firstStartedAt = session.startedAt;
    }
    const activity = session.endedAt ?? session.startedAt;
    if (lastActivityAt === null || activity > lastActivityAt) {
      lastActivityAt = activity;
    }
    days.add(dayKey(session.startedAt));
    speeds.add(session.playbackSpeed);
  }

  return {
    finishedCount: finished.length,
    completedCount,
    interruptedCount,
    openCount: sessions.length - finished.length,
    totalListenedSec,
    longestSec,
    averageSec: finished.length === 0 ? 0 : Math.round(totalListenedSec / finished.length),
    firstStartedAt,
    lastActivityAt,
    daysListened: days.size,
    speeds: [...speeds].sort((left, right) => left - right),
  };
}
