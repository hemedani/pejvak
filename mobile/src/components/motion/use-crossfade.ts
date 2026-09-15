/**
 * A/B layer cross-fade.
 *
 * When a value changes (the current track, its palette, its artwork) we keep the
 * *previous* value rendered underneath and fade the new one in on top. That is
 * what guarantees "zero flickering or visual jumps when a track skips
 * mid-stream": the old layer is never unmounted before the new one has fully
 * faded in, so there is no frame where the canvas is empty.
 *
 * Returns the two values plus a 0→1 `progress` shared value that components map
 * onto opacity (and, for artwork, a zoom-out scale).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { duration as durations, easing } from "@/theme/motion";

export type CrossfadeState<T> = {
  /** The value to show on top. */
  current: T;
  /** The value fading out underneath, or null once the fade is done. */
  previous: T | null;
  /** 0 → 1 over `ms`. Drives the incoming layer. */
  progress: SharedValue<number>;
};

export function useCrossfade<T>(value: T, ms: number = durations.crossfade): CrossfadeState<T> {
  const [layers, setLayers] = useState<{ current: T; previous: T | null }>({
    current: value,
    previous: null,
  });
  const progress = useSharedValue(1);
  const latest = useRef(value);

  useEffect(() => {
    if (Object.is(latest.current, value)) {
      return;
    }
    const outgoing = latest.current;
    latest.current = value;

    setLayers({ current: value, previous: outgoing });
    progress.value = 0;
    progress.value = withTiming(1, { duration: ms, easing: easing.outQuint });
  }, [value, ms, progress]);

  const clearPrevious = useCallback(() => {
    setLayers((state) => (state.previous === null ? state : { ...state, previous: null }));
  }, []);

  // Drop the outgoing layer once it is invisible, so we do not hold two decoded
  // images (or two gradients) alive forever.
  useEffect(() => {
    if (layers.previous === null) {
      return;
    }
    const timer = setTimeout(clearPrevious, ms + 60);
    return () => clearTimeout(timer);
  }, [layers.previous, ms, clearPrevious]);

  return { current: layers.current, previous: layers.previous, progress };
}
