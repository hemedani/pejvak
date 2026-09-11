import type { LocalAnnotation, LocalSession } from "@/lib/db/types";

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
