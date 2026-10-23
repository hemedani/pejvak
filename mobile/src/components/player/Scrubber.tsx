/**
 * The scrubbable timeline.
 *
 * The played segment is an ocean wave: a sine stroke that travels toward the
 * thumb while audio plays, with a gap on each side of the thumb so the thumb
 * reads as cut out of the track rather than laid on top of it. The unplayed
 * segment stays flat and lower-contrast.
 *
 * Under the finger the wave flattens, the thumb grows out of the playhead, a
 * time bubble rises above it showing where you are about to land, and the
 * played portion follows the finger 1:1. The 1:1 follow matters: a spring under
 * the finger feels laggy and lets the playhead disagree with the thumb. The
 * wave's phase and the between-tick progress both run on the UI thread.
 *
 * Layout is three stacked bands, all inside the component's own bounds:
 *
 *   [ bubble headroom ]  where the time bubble animates into
 *   [ touch band     ]   a 44 pt invisible band the gestures attach to
 *   [ marker layer   ]   `children`, aligned to the bar
 *
 * The headroom exists because Android does not deliver touches to — and does not
 * reliably draw — children outside their parent's bounds, so the bubble and the
 * touch target both have to live inside the component rather than overflowing
 * it. The cost is ~66 pt of vertical space in the player.
 *
 * The pan claims the gesture only after ~10 px of *horizontal* travel
 * (`activeOffsetX`), so a vertical flick still scrolls the player's ScrollView.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { ThemedText } from "@/components/themed-text";
import { WavyProgress } from "@/components/player/WavyProgress";
import { triggerHaptic } from "@/components/ui/haptics";
import { useSmoothProgress } from "@/hooks/use-smooth-progress";
import { useTheme } from "@/hooks/use-theme";
import { formatClock } from "@/lib/time";
import { spring, useMotionEnabled } from "@/theme/motion";

/** Height of the invisible touch band. Meets the 44 pt minimum. */
const TOUCH_HEIGHT = 44;
/** Space above the band for the time bubble to rise into. */
const BUBBLE_HEADROOM = 22;
/** Thumb diameter as a multiple of the track thickness. */
const THUMB_RATIO = 3;
/** Thumb scale at rest, so the playhead stays discoverable before you grab it. */
const THUMB_IDLE_SCALE = 0.82;
/** Full wave height, in points. */
const WAVE_AMPLITUDE = 3;
/** Crest spacing, in points. */
const WAVE_WAVELENGTH = 36;
/** Visible space between the thumb's edge and either segment. */
const THUMB_GAP = 4;
/** Bubble box, sized for a three-part time code. */
const BUBBLE_WIDTH = 74;
const BUBBLE_HEIGHT = 26;
/** Gap between the bubble and the top of the thumb. */
const BUBBLE_GAP = 8;
/** Seconds nudged by the accessibility increment/decrement actions. */
const A11Y_STEP_SEC = 15;
/** Scrub-tick haptics: every 2% of the track, at most once per 50 ms. */
const HAPTIC_STEPS = 50;
const HAPTIC_INTERVAL_MS = 50;

export type ScrubberProps = {
  /** 0–1. */
  progress: number;
  /** Total length in seconds; converts a fraction into a position. */
  durationSec: number;
  /** Drives the wave and the 60 fps extrapolation between position ticks. */
  isPlaying: boolean;
  /** Position advances faster or slower than wall-clock time. */
  playbackSpeed?: number;
  /** Colour of the played portion and the thumb ring. */
  tint: string;
  /** Resting track thickness. */
  thickness?: number;
  /** Called once per gesture, with the position the user landed on. */
  onSeek: (positionSec: number) => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function clamp01(value: number): number {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

export function Scrubber({
  progress,
  durationSec,
  isPlaying,
  playbackSpeed = 1,
  tint,
  thickness = 6,
  onSeek,
  children,
  style,
}: ScrubberProps) {
  const theme = useTheme();
  const clamped = clamp01(progress);

  const { progress: smoothProgress, setPosition } = useSmoothProgress({
    positionSec: clamped * durationSec,
    durationSec,
    isPlaying,
    playbackSpeed,
  });

  const width = useSharedValue(0);
  const drag = useSharedValue(clamped);
  const isScrubbing = useSharedValue(0);
  const active = useSharedValue(0);
  /** Last whole second pushed to the bubble, so we only re-render on change. */
  const lastSec = useSharedValue(-1);
  const lastHapticStep = useSharedValue(-1);
  /** JS-side throttle, so a fast drag cannot buzz continuously. */
  const haptic = useRef({ step: -1, at: 0 });

  /**
   * While the finger is down the drag value wins; otherwise the extrapolated
   * progress does. Both are shared values, so this is a UI-thread read.
   */
  const displayed = useDerivedValue(() =>
    isScrubbing.value > 0.5 ? drag.value : smoothProgress.value,
  );

  const [scrubSec, setScrubSec] = useState(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  const emitLabel = useCallback((sec: number) => {
    setScrubSec(sec);
  }, []);

  const maybeScrubHaptic = useCallback((step: number) => {
    const now = Date.now();
    if (step === haptic.current.step || now - haptic.current.at < HAPTIC_INTERVAL_MS) {
      return;
    }
    haptic.current = { step, at: now };
    triggerHaptic("scrub");
  }, []);

  const commitSeek = useCallback(
    (fraction: number) => {
      if (durationSec <= 0) {
        return;
      }
      const target = fraction * durationSec;
      // Optimistic: the bar should stay where the finger left it while the
      // native seek and the store update are in flight.
      setPosition(target);
      triggerHaptic("tap");
      onSeek(target);
    },
    [durationSec, onSeek, setPosition],
  );

  const motionEnabled = useMotionEnabled();

  const beginScrub = useCallback(() => {
    haptic.current = { step: -1, at: Date.now() };
    triggerHaptic("select");
  }, []);

  const endScrub = useCallback(() => {
    isScrubbing.set(0);
  }, [isScrubbing]);

  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          // A vertical flick must reach the ScrollView, so the pan only claims
          // the gesture once the finger has travelled horizontally.
          .activeOffsetX([-10, 10])
          .onStart(() => {
            active.value = motionEnabled ? withSpring(1, spring.snappy) : 1;
            lastSec.value = -1;
            lastHapticStep.value = -1;
            isScrubbing.value = 1;
            drag.value = displayed.value;
            scheduleOnRN(beginScrub);
          })
          .onUpdate((event) => {
            const w = width.value;
            if (w <= 0 || durationSec <= 0) {
              return;
            }
            const fraction = clamp01(event.x / w);
            drag.value = fraction;

            const sec = Math.floor(fraction * durationSec);
            if (sec !== lastSec.value) {
              lastSec.value = sec;
              scheduleOnRN(emitLabel, sec);
            }

            const step = Math.round(fraction * HAPTIC_STEPS);
            if (step !== lastHapticStep.value) {
              lastHapticStep.value = step;
              scheduleOnRN(maybeScrubHaptic, step);
            }
          })
          .onEnd((event) => {
            const w = width.value;
            if (w <= 0 || durationSec <= 0) {
              return;
            }
            scheduleOnRN(commitSeek, clamp01(event.x / w));
          })
          .onFinalize(() => {
            active.value = motionEnabled ? withSpring(0, spring.snappy) : 0;
            scheduleOnRN(endScrub);
          }),
        Gesture.Tap().onEnd((event, success) => {
          const w = width.value;
          // The `durationSec` guard matters: without a loaded track `commitSeek`
          // bails out, so moving the fill here would strand it at the tap point.
          if (!success || w <= 0 || durationSec <= 0) {
            return;
          }
          const fraction = clamp01(event.x / w);
          drag.value = fraction;
          isScrubbing.value = 1;
          scheduleOnRN(commitSeek, fraction);
          scheduleOnRN(endScrub);
        }),
      ),
    [
      active,
      beginScrub,
      commitSeek,
      displayed,
      drag,
      durationSec,
      emitLabel,
      endScrub,
      isScrubbing,
      lastHapticStep,
      lastSec,
      maybeScrubHaptic,
      motionEnabled,
      width,
    ],
  );

  const thumbDiameter = thickness * THUMB_RATIO;
  const thumbRadius = thumbDiameter / 2;
  const thumbTop = (TOUCH_HEIGHT - thumbDiameter) / 2;

  /**
   * The bubble lives in the headroom above the band, and is positioned against
   * `root` rather than `hitArea` so it never renders outside its parent. The
   * headroom exists precisely to give it somewhere legitimate to be — Android
   * clips, or silently drops, children that overflow.
   */
  const bubbleTop = BUBBLE_HEADROOM + thumbTop - BUBBLE_HEIGHT - BUBBLE_GAP;
  /**
   * Where the marker layer starts. The track is centred in the band, so its
   * *centre* is the invariant — the markers must track that centre.
   */
  const markerLayerTop = BUBBLE_HEADROOM + (TOUCH_HEIGHT - thickness) / 2;

  const thumbStyle = useAnimatedStyle(() => {
    const w = width.value;
    // Kept fully inside the track, so the thumb never hangs off either end.
    const centre =
      w > thumbDiameter
        ? Math.min(Math.max(displayed.value * w, thumbRadius), w - thumbRadius)
        : w / 2;
    return {
      opacity: 0.78 + 0.22 * active.value,
      transform: [
        { translateX: centre },
        { scale: THUMB_IDLE_SCALE + (1 - THUMB_IDLE_SCALE) * active.value },
      ],
    };
  });

  const bubbleStyle = useAnimatedStyle(() => {
    const w = width.value;
    const half = BUBBLE_WIDTH / 2;
    // Clamped so the bubble never hangs off the first or last second.
    const x = w > BUBBLE_WIDTH ? Math.min(Math.max(displayed.value * w, half), w - half) : w / 2;
    return {
      opacity: active.value,
      transform: [
        { translateX: x },
        { translateY: (1 - active.value) * 8 },
        { scale: 0.92 + 0.08 * active.value },
      ],
    };
  });

  const currentSec = Math.round(clamped * durationSec);

  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityValue={{ min: 0, max: Math.round(durationSec), now: currentSec }}
      accessibilityActions={[
        { name: "increment", label: "Forward 15 seconds" },
        { name: "decrement", label: "Back 15 seconds" },
      ]}
      onAccessibilityAction={(event) => {
        const { actionName } = event.nativeEvent;
        if (actionName === "increment") {
          onSeek(Math.min(durationSec, currentSec + A11Y_STEP_SEC));
        } else if (actionName === "decrement") {
          onSeek(Math.max(0, currentSec - A11Y_STEP_SEC));
        }
      }}>
      <GestureDetector gesture={gesture}>
        <View onLayout={onLayout} style={styles.hitArea}>
          <WavyProgress
            progress={displayed}
            isPlaying={isPlaying}
            scrubbing={isScrubbing}
            tint={tint}
            trackColor={theme.track}
            thickness={thickness}
            amplitude={WAVE_AMPLITUDE}
            wavelength={WAVE_WAVELENGTH}
            bandHeight={TOUCH_HEIGHT}
            inset={thumbRadius}
            gap={thumbRadius + THUMB_GAP}
            style={styles.wave}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                width: thumbDiameter,
                height: thumbDiameter,
                borderRadius: thumbRadius,
                marginLeft: -thumbRadius,
                top: thumbTop,
                borderColor: tint,
                shadowColor: tint,
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>

      {/* Rendered against `root`, not the band, so it stays inside its parent. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.bubble, { top: bubbleTop }, bubbleStyle]}>
        <ThemedText type="numeric" style={styles.bubbleText}>
          {formatClock(scrubSec)}
        </ThemedText>
      </Animated.View>

      {/* `children` keep their own press handling and stay aligned to the bar. */}
      <View
        pointerEvents="box-none"
        style={[styles.markerLayer, { top: markerLayerTop, height: thickness }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    height: TOUCH_HEIGHT + BUBBLE_HEADROOM,
  },
  hitArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: BUBBLE_HEADROOM,
    height: TOUCH_HEIGHT,
    justifyContent: "center",
  },
  wave: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  thumb: {
    position: "absolute",
    left: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  bubble: {
    position: "absolute",
    left: 0,
    marginLeft: -BUBBLE_WIDTH / 2,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_HEIGHT / 2,
    backgroundColor: "rgba(14, 20, 26, 0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleText: {
    color: "#FFFFFF",
  },
  markerLayer: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
