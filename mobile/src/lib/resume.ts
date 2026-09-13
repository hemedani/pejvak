import type { LocalSession } from "@/lib/db/types";

/** A position within this many seconds of the end counts as finished. */
export const COMPLETION_EPSILON_SEC = 5;

type SessionPosition = Pick<LocalSession, "startedAt" | "endedAt" | "endPositionSec">;

/**
 * Resume position for a track: the furthest point reached in the most recent
 * finished session, or 0 when the track was completed or never played.
 * Positions are integer seconds; seek deltas never affect this.
 */
export function resumePositionSec(sessions: SessionPosition[], durationSec: number): number {
  const latest = sessions
    .filter((session) => session.endedAt !== null && session.endPositionSec !== null)
    .reduce<SessionPosition | null>(
      (acc, session) => (acc === null || session.startedAt >= acc.startedAt ? session : acc),
      null,
    );

  const position = latest?.endPositionSec ?? 0;
  if (position <= 0) {
    return 0;
  }
  if (durationSec > 0 && position >= durationSec - COMPLETION_EPSILON_SEC) {
    return 0;
  }
  return durationSec > 0 ? Math.min(position, durationSec) : position;
}
