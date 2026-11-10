/**
 * A horizontal slider — the app's one adjustable-value control.
 *
 * Distinct from `Scrubber` on purpose. The scrubber is a *timeline*: it has a
 * wave, a time bubble, markers and a position that keeps moving on its own. A
 * slider has none of that; it holds a value the listener set, and its whole job
 * is to make that value adjustable in one gesture.
 *
 * Three behaviours are load-bearing:
 *
 *   · **The thumb follows the finger 1:1.** A spring under the finger lags, and
 *     a value that lags its own control reads as a broken control.
 *   · **The value is emitted live and quantised.** A caller wants the effect to
 *     change while dragging, not after; but a raw fraction would store
 *     `3.4999 dB`, so every emission is snapped to the step first.
 *   · **The pan waits for horizontal travel.** These sliders live inside a
 *     scroll view, and a vertical flick has to reach it.
 *
 * `bipolar` draws the fill out from the centre of the track instead of from its
 * left edge — the honest picture of a control whose zero is in the middle, which
 * is every tone control the player has.
 */

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { triggerHaptic } from "@/components/ui/haptics";
import { useTheme } from "@/hooks/use-theme";
import { radius, spacing } from "@/theme/tokens";

/** The invisible band the gesture attaches to. Meets the 44 pt minimum. */
const TOUCH_HEIGHT = 44;
const TRACK_HEIGHT = 6;
const THUMB_SIZE = 18;
/** How far the finger must travel horizontally before the pan claims it. */
const PAN_THRESHOLD = 8;
/** Haptics at most this often while dragging — one per step would buzz. */
const HAPTIC_INTERVAL_MS = 60;
/** Accessibility nudges move this many steps at once. */
const A11Y_STEPS = 4;

export type SliderProps = {
  value: number;
  min: number;
  max: number;
  /** Smallest change the control can express. */
  step?: number;
  /** Spoken name; there is no visible label inside the track. */
  label: string;
  /** Spoken explanation of what changing the value does. */
  hint?: string;
  /** Fires while dragging, already snapped to `step`. */
  onChange: (value: number) => void;
  /** Fires once, when the finger lifts or the track is tapped. */
  onCommit?: (value: number) => void;
  /** Colour of the filled portion and the thumb's ring. */
  tint: string;
  /** Draw the fill from zero rather than from the left end. */
  bipolar?: boolean;
  disabled?: boolean;
  /** Rendered after the track, for a leading glyph or a trailing readout. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function clamp01(value: number): number {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

function fractionOf(value: number, min: number, max: number): number {
  "worklet";
  const span = max - min;
  return span > 0 ? clamp01((value - min) / span) : 0;
}

/** Snaps a fraction to the nearest step, in value space. */
function snap(fraction: number, min: number, max: number, step: number): number {
  "worklet";
  const raw = min + fraction * (max - min);
  if (step <= 0) {
    return raw;
  }
  return min + Math.round((raw - min) / step) * step;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  hint,
  onChange,
  onCommit,
  tint,
  bipolar = false,
  disabled = false,
  children,
  style,
}: SliderProps) {
  const theme = useTheme();

  const width = useSharedValue(0);
  const dragging = useSharedValue(0);
  const dragFraction = useSharedValue(fractionOf(value, min, max));
  const lastEmitted = useSharedValue(value);

  const restFraction = useDerivedValue(() => fractionOf(value, min, max));

  /** While the finger is down its own value wins; otherwise the prop does. */
  const displayed = useDerivedValue(() =>
    dragging.value > 0.5 ? dragFraction.value : restFraction.value,
  );

  const haptic = useRef(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  const emit = useCallback(
    (next: number) => {
      onChange(next);
    },
    [onChange],
  );

  const commit = useCallback(
    (next: number) => {
      onChange(next);
      onCommit?.(next);
      triggerHaptic("tap");
    },
    [onChange, onCommit],
  );

  const maybeHaptic = useCallback(() => {
    const now = Date.now();
    if (now - haptic.current < HAPTIC_INTERVAL_MS) {
      return;
    }
    haptic.current = now;
    triggerHaptic("scrub");
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          .enabled(!disabled)
          .activeOffsetX([-PAN_THRESHOLD, PAN_THRESHOLD])
          .onStart(() => {
            dragging.value = 1;
            dragFraction.value = fractionOf(value, min, max);
            lastEmitted.value = value;
          })
          .onUpdate((event) => {
            const w = width.value;
            if (w <= 0) {
              return;
            }
            const fraction = clamp01(event.x / w);
            dragFraction.value = fraction;
            const next = snap(fraction, min, max, step);
            if (Math.abs(next - lastEmitted.value) > 1e-6) {
              lastEmitted.value = next;
              scheduleOnRN(emit, next);
              scheduleOnRN(maybeHaptic);
            }
          })
          .onEnd((event) => {
            const w = width.value;
            if (w <= 0) {
              return;
            }
            scheduleOnRN(commit, snap(clamp01(event.x / w), min, max, step));
          })
          .onFinalize(() => {
            dragging.value = 0;
          }),
        Gesture.Tap()
          .enabled(!disabled)
          .onEnd((event, success) => {
            const w = width.value;
            if (!success || w <= 0) {
              return;
            }
            const next = snap(clamp01(event.x / w), min, max, step);
            dragFraction.value = fractionOf(next, min, max);
            scheduleOnRN(commit, next);
          }),
      ),
    [
      commit,
      disabled,
      dragFraction,
      dragging,
      emit,
      lastEmitted,
      max,
      maybeHaptic,
      min,
      step,
      value,
      width,
    ],
  );

  const centreFraction = bipolar ? fractionOf(0, min, max) : 0;

  const fillStyle = useAnimatedStyle(() => {
    const w = width.value;
    const position = displayed.value;
    const left = Math.min(position, centreFraction) * w;
    const right = Math.max(position, centreFraction) * w;
    return { left, width: Math.max(0, right - left) };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const w = width.value;
    const half = THUMB_SIZE / 2;
    const centre = w > THUMB_SIZE ? Math.min(Math.max(displayed.value * w, half), w - half) : w / 2;
    return { transform: [{ translateX: centre - half }] };
  });

  const nudge = (direction: 1 | -1) => {
    const next = Math.max(min, Math.min(max, value + direction * step * A11Y_STEPS));
    commit(next);
  };

  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[
        { name: "increment", label: "Increase" },
        { name: "decrement", label: "Decrease" },
      ]}
      onAccessibilityAction={(event) => {
        const { actionName } = event.nativeEvent;
        if (actionName === "increment") {
          nudge(1);
        } else if (actionName === "decrement") {
          nudge(-1);
        }
      }}>
      <GestureDetector gesture={gesture}>
        <View onLayout={onLayout} style={styles.hitArea}>
          <View style={[styles.track, { backgroundColor: theme.track }]} />
          <Animated.View
            pointerEvents="none"
            style={[styles.fill, { backgroundColor: disabled ? theme.outlineStrong : tint }, fillStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                borderColor: disabled ? theme.outlineStrong : tint,
                backgroundColor: theme.surface,
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  hitArea: {
    flex: 1,
    height: TOUCH_HEIGHT,
    justifyContent: "center",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
  },
  fill: {
    position: "absolute",
    top: (TOUCH_HEIGHT - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
  },
  thumb: {
    position: "absolute",
    top: (TOUCH_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
