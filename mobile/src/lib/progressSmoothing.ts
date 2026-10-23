/**
 * Progress interpolation for the seek bar.
 *
 * The player reports its position about once a second. A thumb that moves once
 * a second reads as broken, so between ticks we extrapolate from the last real
 * position using wall-clock time and playback speed. The rules that matter:
 *
 *   · a normal tick never rewinds the anchor — the reported position is floored
 *     to whole seconds, so adopting it verbatim would step the bar back every
 *     second;
 *   · a seek, a duration change, or a pause/resume does snap, because those are
 *     new truths rather than a late report of the old one.
 */

export type ProgressAnchor = {
  positionSec: number;
  /** Wall-clock time at which `positionSec` was observed. */
  atMs: number;
  durationSec: number;
  playbackSpeed: number;
  isPlaying: boolean;
};

export type ResyncInput = {
  extrapolatedSec: number;
  /** The previous position report, before this one arrived. */
  previousPositionSec: number;
  nextPositionSec: number;
  durationChanged: boolean;
  wasPlaying: boolean;
  isPlaying: boolean;
  /** A change larger than this is a seek, not a late tick. */
  seekThresholdSec?: number;
};

/** Seconds as a 0–1 fraction, clamped so a stale duration cannot overshoot. */
export function progressRatio(positionSec: number, durationSec: number): number {
  if (!(durationSec > 0)) {
    return 0;
  }
  return Math.max(0, Math.min(1, positionSec / durationSec));
}

/** Where playback most likely is now, between two real position reports. */
export function extrapolatePosition(anchor: ProgressAnchor, nowMs: number): number {
  const duration = Math.max(0, anchor.durationSec);
  const base = Math.max(0, Math.min(anchor.positionSec, duration));
  if (!anchor.isPlaying || duration <= 0) {
    return base;
  }
  const elapsedSec = Math.max(0, nowMs - anchor.atMs) / 1000;
  const speed = Number.isFinite(anchor.playbackSpeed) ? anchor.playbackSpeed : 1;
  return Math.max(0, Math.min(duration, base + elapsedSec * Math.max(0, speed)));
}

export function shouldResyncToTick({
  extrapolatedSec,
  previousPositionSec,
  nextPositionSec,
  durationChanged,
  wasPlaying,
  isPlaying,
  seekThresholdSec = 2,
}: ResyncInput): boolean {
  if (durationChanged || wasPlaying !== isPlaying) {
    return true;
  }
  // Position reports are floored, so a tick may sit slightly behind the
  // extrapolation, but it never moves backwards. A report that does is a seek,
  // however small, and must be honoured rather than swallowed by the anchor.
  if (nextPositionSec < previousPositionSec - 0.5) {
    return true;
  }
  return Math.abs(nextPositionSec - extrapolatedSec) > seekThresholdSec;
}

/** The position the next extrapolation starts from. */
export function nextAnchorPosition({
  resync,
  nextPositionSec,
  extrapolatedSec,
}: {
  resync: boolean;
  nextPositionSec: number;
  extrapolatedSec: number;
}): number {
  return resync ? nextPositionSec : Math.max(nextPositionSec, extrapolatedSec);
}
