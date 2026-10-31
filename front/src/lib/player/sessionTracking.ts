/**
 * Pure session-tracking state machine, ported from
 * `mobile/src/lib/sessionTracking.ts`.
 *
 * `durationListenedSec` is the wall-clock listening total, accumulated from
 * playback progress deltas — never `endPositionSec - startPositionSec`:
 *   - a normal forward play (`0 < delta < 5`) adds the delta,
 *   - a seek (`delta > 5` or `delta < 0`) moves the position without adding,
 *   - `delta === 5` neither adds nor counts as a seek.
 *
 * ## The browser extension (brief §4.1)
 *
 * A background tab may deliver `timeupdate` once every ten seconds, so a delta
 * of 10 is not necessarily a seek. The sample therefore carries the wall-clock
 * gap and the DOM `seeked` flag:
 *
 *   - a listener scrub always sets `seeked`, and the flag wins;
 *   - a forward jump larger than could have played is a seek;
 *   - a large delta consistent with elapsed time × speed is playback, capped at
 *     what could have played;
 *   - a negative delta is always a seek.
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
  /** Wall-clock time of the previous sample, for the browser extension. */
  lastAtMs: number;
};

export type ProgressSample = {
  positionSec: number;
  atMs: number;
  /** Defaults to the tracker's current speed. */
  playbackSpeed?: number;
  /** A `seeking`/`seeked` event happened since the previous sample. */
  seeked?: boolean;
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

/** Kept for the mobile-shaped call sites; it is the browser sample now. */
export type ProgressInput = ProgressSample;

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
    lastAtMs: input.startedAtMs,
  };
}

export function applyProgress(
  state: SessionTrackerState,
  input: ProgressSample,
): ProgressResult {
  const playbackSpeed = input.playbackSpeed ?? state.playbackSpeed;
  const deltaSec = input.positionSec - state.lastPositionSec;
  const elapsedSec = Math.max(0, (input.atMs - state.lastAtMs) / 1000);
  const plausibleMax = elapsedSec * Math.max(1, playbackSpeed) + 1.5;

  const isSeek =
    input.seeked === true ||
    deltaSec < 0 ||
    (deltaSec > SEEK_THRESHOLD_SEC && deltaSec > plausibleMax);

  // Exactly the threshold is neither playback nor a seek (mobile's rule). A
  // forward move that is plausible for the elapsed wall-clock time is counted,
  // capped at what could actually have played.
  const countedSec =
    isSeek || deltaSec <= 0 || deltaSec === SEEK_THRESHOLD_SEC
      ? 0
      : Math.min(deltaSec, plausibleMax);

  const checkpointDue = input.atMs - state.lastCheckpointAtMs >= CHECKPOINT_INTERVAL_MS;

  return {
    state: {
      ...state,
      lastPositionSec: input.positionSec,
      durationListenedSec: state.durationListenedSec + countedSec,
      playbackSpeed,
      lastAtMs: input.atMs,
      lastCheckpointAtMs: checkpointDue ? input.atMs : state.lastCheckpointAtMs,
    },
    deltaSec,
    countedSec,
    isSeek,
    checkpointDue,
  };
}
