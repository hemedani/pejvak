/**
 * The wavy progress bar.
 *
 * The played segment is a sine stroke that travels to the right while audio is
 * playing; the remaining segment is a flat, lower-contrast line. A gap on each
 * side of the thumb separates the two, so the thumb reads as cut out of the
 * track rather than sitting on top of it.
 *
 * The wave is drawn from a shared progress value in the draw phase — no React
 * render per frame. When playback pauses the amplitude flattens over ~380 ms,
 * then the phase animation stops and the bar is completely idle; a flattening
 * wave that kept its phase loop running is the bug this design exists to avoid.
 */

import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { buildWavePath, wavePhaseDelta } from "@/lib/waveform";
import { easing, useMotionEnabled } from "@/theme/motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Matches the house state-change timing; long enough to read as a settle. */
const FLATTEN_MS = 380;
/** The gap grows a little as the wave rises, so it never crowds the crest. */
const GAP_GROWTH = 2;
/**
 * The wave is decorative; a 60 Hz redraw of a sine path is not worth a frame.
 * 30 Hz still reads as continuous motion and halves the draw-phase work.
 */
const PHASE_INTERVAL_MS = 1000 / 30;

export type WavyProgressProps = {
  /** 0–1. Read on the UI thread, so it must be a shared value. */
  progress: SharedValue<number>;
  isPlaying: boolean;
  /** 0 = at rest, 1 = under the finger. Omit for a read-only bar. */
  scrubbing?: SharedValue<number>;
  /** Played segment colour. */
  tint: string;
  /** Unplayed segment colour, normally `theme.track`. */
  trackColor: string;
  /** Stroke thickness, in points. */
  thickness?: number;
  /** Maximum distance from the centreline, in points. */
  amplitude?: number;
  /** Distance between crests, in points. */
  wavelength?: number;
  /** Height of the drawing band. Reserve the amplitude and it cannot jump. */
  bandHeight?: number;
  /** Half the thumb's width. Keeps the wave clamped like the thumb. */
  inset?: number;
  /** Distance from the playhead centre to each segment, in points. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

export function WavyProgress({
  progress,
  isPlaying,
  scrubbing,
  tint,
  trackColor,
  thickness = 6,
  amplitude = 3,
  wavelength = 36,
  bandHeight = thickness + amplitude * 2 + 4,
  inset = 0,
  gap = 6,
  style,
}: WavyProgressProps) {
  const motionEnabled = useMotionEnabled();
  const [width, setWidth] = useState(0);

  const band = useSharedValue(0);
  const phase = useSharedValue(0);
  const amp = useSharedValue(0);
  const playing = useSharedValue(isPlaying ? 1 : 0);
  const motion = useSharedValue(motionEnabled ? 1 : 0);
  const idleScrub = useSharedValue(0);
  const isScrubbing = scrubbing ?? idleScrub;

  const accumulator = useSharedValue(0);
  const frame = useFrameCallback((frameInfo) => {
    const dt = Math.min(frameInfo.timeSincePreviousFrame ?? 16.67, 50);
    accumulator.value += dt;
    if (accumulator.value < PHASE_INTERVAL_MS) {
      return;
    }
    // Advance by the time actually elapsed, not by one nominal frame, so the
    // wave keeps its speed when a frame is dropped.
    const step = accumulator.value;
    accumulator.value = 0;
    phase.value += wavePhaseDelta(step);
  }, false);

  useEffect(() => {
    playing.value = isPlaying ? 1 : 0;
    motion.value = motionEnabled ? 1 : 0;
    frame.setActive(isPlaying && motionEnabled);
  }, [frame, isPlaying, motion, motionEnabled, playing]);

  // The target is only ever 0 or 1: the animated value is our own amplitude,
  // which drives the gap, while the stroke's amplitude is read from it here.
  const target = useDerivedValue(() =>
    motion.value > 0.5 && playing.value > 0.5 && isScrubbing.value < 0.5 ? 1 : 0,
  );

  useAnimatedReaction(
    () => target.value,
    (next) => {
      amp.value = withTiming(next, {
        duration: FLATTEN_MS,
        easing: easing.outQuint,
        reduceMotion: ReduceMotion.Never,
      });
    },
    [],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.width;
      band.value = next;
      setWidth(next);
    },
    [band],
  );

  const waveProps = useAnimatedProps(() => {
    const w = band.value;
    const half = Math.min(inset, w / 2);
    const clamped = Math.max(0, Math.min(1, progress.value));
    const thumbX = w > 0 ? Math.min(Math.max(clamped * w, half), w - half) : 0;
    const currentGap = gap + amp.value * GAP_GROWTH;
    return {
      d: buildWavePath({
        width: w,
        centerY: bandHeight / 2,
        amplitude: amp.value * amplitude,
        wavelength,
        phase: phase.value,
        endX: Math.max(0, thumbX - currentGap),
      }),
    };
  }, [amplitude, bandHeight, gap, inset, wavelength]);

  /**
   * The unplayed segment is drawn in the same SVG rather than as a positioned
   * View. Moving a View's `left` each frame re-runs layout; an SVG path is a
   * draw-phase update, like the wave itself.
   */
  const remainingProps = useAnimatedProps(() => {
    const w = band.value;
    const half = Math.min(inset, w / 2);
    const clamped = Math.max(0, Math.min(1, progress.value));
    const thumbX = w > 0 ? Math.min(Math.max(clamped * w, half), w - half) : 0;
    const start = Math.min(w, thumbX + gap + amp.value * GAP_GROWTH);
    return {
      d: `M ${start} ${bandHeight / 2} L ${w} ${bandHeight / 2}`,
      opacity: start < w - 0.5 ? 1 : 0,
    };
  }, [bandHeight, gap, inset]);

  return (
    <View onLayout={onLayout} style={[styles.band, { height: bandHeight }, style]}>
      {width > 0 ? (
        <Svg
          pointerEvents="none"
          width={width}
          height={bandHeight}
          style={styles.svg}>
          <AnimatedPath
            animatedProps={waveProps}
            stroke={tint}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <AnimatedPath
            animatedProps={remainingProps}
            stroke={trackColor}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "relative",
  },
  svg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
