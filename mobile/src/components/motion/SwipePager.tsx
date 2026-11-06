/**
 * Horizontal swipe between a fixed strip of sibling views.
 *
 * Deliberately *not* a pager. A pager mounts every page side by side and slides
 * a strip past a viewport, which is the right shape when the pages are cheap and
 * identical — a carousel, an onboarding flow. Here every page is a `FlatList`
 * over a different dataset, several thousand rows deep. Mounting four of them so
 * the finger has something to drag would mean four lists measuring, four lists
 * holding cells, and four scroll positions to keep honest, to buy a drag that
 * lasts 200 ms.
 *
 * So the page is *nudged*, not paged: the content follows the finger a short way
 * as a preview, and on release either snaps back or swaps to the neighbour. The
 * swap is instant and the nudge has already told the finger which way it went,
 * which is why the snap-back is not animated into the incoming page — that would
 * require the new page to exist before React has rendered it, and the frame in
 * between is exactly the flash this design avoids.
 *
 * ## Why the gesture does not fight the list
 *
 * `activeOffsetX` keeps a vertical drag from ever activating it, and
 * `failOffsetY` gives the list the win the moment the finger moves up or down
 * first. A drag that starts horizontal belongs to this component; a drag that
 * starts vertical belongs to the `FlatList` underneath and is never interrupted.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  SWIPE_RESISTANCE,
  SWIPE_TRAVEL,
  swipeCommit,
} from "@/lib/swipeNavigation";
import { spring, useMotionEnabled } from "@/theme/motion";

export type SwipePagerProps = {
  /** Index of the child currently shown. */
  index: number;
  /** How many siblings there are; a swipe past either end is a bounce. */
  count: number;
  /** Called with the index the gesture asked for. */
  onIndexChange: (next: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SwipePager({
  index,
  count,
  onIndexChange,
  children,
  style,
}: SwipePagerProps) {
  const motionEnabled = useMotionEnabled();
  const translateX = useSharedValue(0);

  const canPrev = index > 0;
  const canNext = index < count - 1;

  /**
   * Runs on the JS thread, because the decision it makes is the one worth
   * testing and `lib/swipeNavigation` is where that decision lives.
   */
  const settle = useCallback(
    (dx: number, velocityX: number) => {
      const direction = swipeCommit({ dx, velocityX, canPrev, canNext });
      if (direction === 0) {
        translateX.value = motionEnabled ? withSpring(0, spring.snappy) : 0;
        return;
      }
      // Straight to rest, in the same tick as the swap: the offset the finger
      // left behind belongs to the page being replaced, and letting the new one
      // inherit it would make it arrive from the wrong side.
      translateX.value = 0;
      onIndexChange(index + direction);
    },
    [canNext, canPrev, index, motionEnabled, onIndexChange, translateX],
  );

  const gesture = useMemo(() => {
    return Gesture.Pan()
      // Sixteen points is past the wobble of a tap and inside the shortest
      // deliberate swipe; below that a horizontal drag is more likely a shaky
      // vertical one.
      .activeOffsetX([-16, 16])
      .failOffsetY([-16, 16])
      .onUpdate((event) => {
        if (!motionEnabled) {
          return;
        }
        const travel = event.translationX * SWIPE_RESISTANCE;
        translateX.value = Math.max(-SWIPE_TRAVEL, Math.min(SWIPE_TRAVEL, travel));
      })
      .onEnd((event) => {
        scheduleOnRN(settle, event.translationX, event.velocityX);
      });
  }, [motionEnabled, settle, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.host, style, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
