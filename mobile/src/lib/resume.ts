import type { LocalSession } from "@/lib/db/types";

/** A position within this many seconds of the end counts as finished. */
export const COMPLETION_EPSILON_SEC = 5;

type SessionPosition = Pick<LocalSession, "startedAt" | "endedAt" | "endPositionSec">;

/**
 * Clamps a raw saved position into something worth resuming at.
 *
 * A position at or past the end means there is nothing left to hear, so the
 * track restarts from 0 rather than opening on its final seconds. Extracted
 * from `resumePositionSec` because folder play resolves positions from a
 * different query (the latest ended session per track, in one round trip) and
 * must apply *exactly* the same rule — two copies of this epsilon would drift.
 */
export function clampResumePosition(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(positionSec) || positionSec <= 0) {
    return 0;
  }
  if (durationSec > 0 && positionSec >= durationSec - COMPLETION_EPSILON_SEC) {
    return 0;
  }
  return durationSec > 0 ? Math.min(positionSec, durationSec) : positionSec;
}

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

  return clampResumePosition(latest?.endPositionSec ?? 0, durationSec);
}
