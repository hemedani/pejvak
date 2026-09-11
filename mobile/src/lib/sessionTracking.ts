/**
 * Pure session-tracking state machine.
 *
 * `durationListenedSec` is the wall-clock listening total, accumulated from
 * playback progress deltas — never `endPositionSec - startPositionSec`:
 *   - a normal forward play (`0 < delta < 5`) adds the delta,
 *   - a seek (`delta > 5` or `delta < 0`) moves the position without adding,
 *   - `delta === 5` neither adds nor counts as a seek.
 *
 * The native audio callback feeds `applyProgress`; the returned state is
 * persisted to SQLite (and checkpointed every 10 s of wall-clock time).
 */
export const SEEK_THRESHOLD_SEC = 5;
export const CHECKPOINT_INTERVAL_MS = 10_000;

export type SessionTrackerState = {
  sessionId: string;
  startedAtMs: number;
  startPositionSec: number;
  lastPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  lastCheckpointAtMs: number;
};

export type ProgressInput = {
  positionSec: number;
  atMs: number;
};

export type ProgressResult = {
  state: SessionTrackerState;
  /** Raw position movement this event. */
  deltaSec: number;
  /** Seconds added to `durationListenedSec` (0 on a seek). */
  countedSec: number;
  isSeek: boolean;
  /** True when a checkpoint should be written for this event. */
  checkpointDue: boolean;
};

export function createSessionTracker(input: {
  sessionId: string;
  startedAtMs: number;
  startPositionSec: number;
  playbackSpeed: number;
}): SessionTrackerState {
  return {
    sessionId: input.sessionId,
    startedAtMs: input.startedAtMs,
    startPositionSec: Math.round(input.startPositionSec),
    lastPositionSec: input.startPositionSec,
    durationListenedSec: 0,
    playbackSpeed: input.playbackSpeed,
    lastCheckpointAtMs: input.startedAtMs,
  };
}

export function applyProgress(
  state: SessionTrackerState,
  input: ProgressInput,
): ProgressResult {
  const deltaSec = input.positionSec - state.lastPositionSec;
  const isSeek = deltaSec > SEEK_THRESHOLD_SEC || deltaSec < 0;
  const countedSec =
    !isSeek && deltaSec > 0 && deltaSec < SEEK_THRESHOLD_SEC ? deltaSec : 0;
  const checkpointDue = input.atMs - state.lastCheckpointAtMs >= CHECKPOINT_INTERVAL_MS;

  return {
    state: {
      ...state,
      lastPositionSec: input.positionSec,
      durationListenedSec: state.durationListenedSec + countedSec,
      lastCheckpointAtMs: checkpointDue ? input.atMs : state.lastCheckpointAtMs,
    },
    deltaSec,
    countedSec,
    isSeek,
    checkpointDue,
  };
}
