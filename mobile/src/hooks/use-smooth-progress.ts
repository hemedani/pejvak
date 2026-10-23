/**
 * 60 fps progress between the player's one-per-second position reports.
 *
 * The returned shared value is written on the UI thread, so the steady
 * extrapolation never re-renders the player screen. `setPosition` is the
 * optimistic hook for a seek: the caller sets the target the instant the finger
 * lifts, so the bar does not snap back to the old position while the native
 * seek and the store update are still in flight.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  extrapolatePosition,
  nextAnchorPosition,
  progressRatio,
  shouldResyncToTick,
} from "@/lib/progressSmoothing";

export type SmoothProgressOptions = {
  positionSec: number;
  durationSec: number;
  isPlaying: boolean;
  playbackSpeed?: number;
};

export type SmoothProgress = {
  /** 0–1, advanced every frame while playing. */
  progress: SharedValue<number>;
  /** Move the display immediately, before the player and store catch up. */
  setPosition: (positionSec: number) => void;
};

export function useSmoothProgress({
  positionSec,
  durationSec,
  isPlaying,
  playbackSpeed = 1,
}: SmoothProgressOptions): SmoothProgress {
  const progress = useSharedValue(progressRatio(positionSec, durationSec));
  const anchorPosition = useSharedValue(positionSec);
  // Filled in on mount; zero means "no anchor yet", which makes the first pass
  // adopt the reported position verbatim instead of extrapolating from 1970.
  const anchorMs = useSharedValue(0);
  const duration = useSharedValue(durationSec);
  const speed = useSharedValue(playbackSpeed);
  const playing = useSharedValue(isPlaying);
  /** The previous position reported by the player, not the extrapolated one. */
  const reportedPosition = useRef(positionSec);

  const frame = useFrameCallback((frameInfo) => {
    if (!playing.get() || duration.get() <= 0) {
      return;
    }
    // A long gap means the frame callback was paused (backgrounded, or the
    // player was paused); advancing by the whole gap would make the bar jump.
    const dt = Math.min(frameInfo.timeSincePreviousFrame ?? 16.67, 50);
    const delta = (dt / 1000) * Math.max(0, speed.get()) / duration.get();
    progress.set(Math.min(1, progress.get() + delta));
  }, false);

  useEffect(() => {
    const now = Date.now();
    const lastAnchorMs = anchorMs.get();
    const lastDuration = duration.get();
    const wasPlaying = playing.get();
    const extrapolated =
      lastAnchorMs > 0
        ? extrapolatePosition(
            {
              positionSec: anchorPosition.get(),
              atMs: lastAnchorMs,
              durationSec: lastDuration,
              playbackSpeed: speed.get(),
              isPlaying: wasPlaying,
            },
            now,
          )
        : positionSec;
    const resync = shouldResyncToTick({
      extrapolatedSec: extrapolated,
      previousPositionSec: reportedPosition.current,
      nextPositionSec: positionSec,
      durationChanged: lastDuration !== durationSec,
      wasPlaying,
      isPlaying,
    });
    const next = nextAnchorPosition({
      resync,
      nextPositionSec: positionSec,
      extrapolatedSec: extrapolated,
    });

    anchorPosition.set(next);
    anchorMs.set(now);
    duration.set(durationSec);
    speed.set(playbackSpeed);
    playing.set(isPlaying);
    progress.set(progressRatio(next, durationSec));
    reportedPosition.current = positionSec;
    frame.setActive(isPlaying && durationSec > 0);
  }, [
    anchorMs,
    anchorPosition,
    duration,
    durationSec,
    frame,
    isPlaying,
    playbackSpeed,
    playing,
    positionSec,
    progress,
    speed,
  ]);

  const setPosition = useCallback(
    (nextPositionSec: number) => {
      anchorPosition.set(nextPositionSec);
      anchorMs.set(Date.now());
      progress.set(progressRatio(nextPositionSec, duration.get()));
    },
    [anchorMs, anchorPosition, duration, progress],
  );

  return useMemo(() => ({ progress, setPosition }), [progress, setPosition]);
}
