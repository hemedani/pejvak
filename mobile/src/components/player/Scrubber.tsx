/**
 * The scrubbable timeline.
 *
 * The bar is deliberately minimal at rest and comes alive under the finger:
 *
 *   · the track thickens (6 → ~10 px) on a spring
 *   · a thumb grows out of the playhead, ringed and glowing in the track colour
 *   · a time bubble rises above the thumb showing where you are about to land
 *   · the played portion follows the finger 1:1 while scrubbing
 *
 * The 1:1 follow matters. A spring under the finger feels laggy and lets the
 * playhead disagree with the thumb; the spring is for *unattended* updates
 * (playback ticking along), not for the drag itself.
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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { ThemedText } from "@/components/themed-text";
import { triggerHaptic } from "@/components/ui/haptics";
import { withAlpha } from "@/lib/palette";
import { formatClock } from "@/lib/time";
import { spring } from "@/theme/motion";
import { radius as radii } from "@/theme/tokens";

/** Height of the invisible touch band. Meets the 44 pt minimum. */
const TOUCH_HEIGHT = 44;
/** Space above the band for the time bubble to rise into. */
const BUBBLE_HEADROOM = 22;
/** Thumb diameter as a multiple of the track thickness. */
const THUMB_RATIO = 2.4;
/** Thumb scale at rest, so the playhead stays discoverable before you grab it. */
const THUMB_IDLE_SCALE = 0.58;
/** How much the track thickens while scrubbing. */
const ACTIVE_THICKNESS_RATIO = 1.7;
/** Bubble box, sized for a three-part time code. */
const BUBBLE_WIDTH = 74;
const BUBBLE_HEIGHT = 26;
/** Gap between the bubble and the top of the thumb. */
const BUBBLE_GAP = 8;
/** Seconds nudged by the accessibility increment/decrement actions. */
const A11Y_STEP_SEC = 15;

export type ScrubberProps = {
  /** 0–1. */
  progress: number;
  /** Total length in seconds; converts a fraction into a position. */
  durationSec: number;
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
  tint,
  thickness = 6,
  onSeek,
  children,
  style,
}: ScrubberProps) {
  const clamped = clamp01(progress);

  const width = useSharedValue(0);
  const value = useSharedValue(clamped);
  const active = useSharedValue(0);
  /** Last whole second pushed to the bubble, so we only re-render on change. */
  const lastSec = useSharedValue(-1);

  const [scrubSec, setScrubSec] = useState(0);
  // Read by the progress-sync effect: a store update arriving mid-drag must not
  // yank the fill out from under the finger.
  const scrubbing = useRef(false);

  useEffect(() => {
    if (scrubbing.current) {
      return;
    }
    value.value = withSpring(clamped, spring.snappy);
  }, [clamped, value]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  const emitLabel = useCallback((sec: number) => {
    setScrubSec(sec);
  }, []);

  const commitSeek = useCallback(
    (fraction: number) => {
      if (durationSec <= 0) {
        return;
      }
      triggerHaptic("light");
      onSeek(fraction * durationSec);
    },
    [durationSec, onSeek],
  );

  const beginScrub = useCallback(() => {
    scrubbing.current = true;
    triggerHaptic("selection");
  }, []);

  const endScrub = useCallback(() => {
    scrubbing.current = false;
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          // A vertical flick must reach the ScrollView, so the pan only claims
          // the gesture once the finger has travelled horizontally.
          .activeOffsetX([-10, 10])
          .onStart(() => {
            active.value = withSpring(1, spring.snappy);
            lastSec.value = -1;
            scheduleOnRN(beginScrub);
          })
          .onUpdate((event) => {
            const w = width.value;
            if (w <= 0 || durationSec <= 0) {
              return;
            }
            const fraction = clamp01(event.x / w);
            value.value = fraction;

            const sec = Math.floor(fraction * durationSec);
            if (sec !== lastSec.value) {
              lastSec.value = sec;
              scheduleOnRN(emitLabel, sec);
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
            active.value = withSpring(0, spring.snappy);
            scheduleOnRN(endScrub);
          }),
        Gesture.Tap().onEnd((event, success) => {
          const w = width.value;
          // The `durationSec` guard matters: without a loaded track `commitSeek`
          // bails out, so moving the fill here would strand it at the tap point
          // — the sync effect only runs when `clamped` actually changes.
          if (!success || w <= 0 || durationSec <= 0) {
            return;
          }
          const fraction = clamp01(event.x / w);
          value.value = fraction;
          scheduleOnRN(commitSeek, fraction);
        }),
      ),
    [active, beginScrub, commitSeek, durationSec, emitLabel, endScrub, lastSec, value, width],
  );

  const trackStyle = useAnimatedStyle(() => {
    const height = thickness * (1 + (ACTIVE_THICKNESS_RATIO - 1) * active.value);
    return { height, borderRadius: height / 2 };
  });

  const fillStyle = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

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
   * *centre* is the invariant — the bar thickens from the middle, and the
   * markers must track that centre rather than the (thicker) thumb.
   */
  const markerLayerTop = BUBBLE_HEADROOM + (TOUCH_HEIGHT - thickness) / 2;

  const thumbStyle = useAnimatedStyle(() => {
    const w = width.value;
    // Kept fully inside the track, so the thumb never hangs off either end.
    const centre =
      w > thumbDiameter ? Math.min(Math.max(value.value * w, thumbRadius), w - thumbRadius) : w / 2;
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
    const x = w > BUBBLE_WIDTH ? Math.min(Math.max(value.value * w, half), w - half) : w / 2;
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
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View
              style={[styles.fill, { backgroundColor: tint, shadowColor: tint }, fillStyle]}
            />
          </Animated.View>

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
  track: {
    backgroundColor: withAlpha("#7F8999", 0.24),
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radii.pill,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 3,
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
