/**
 * A horizontally paged strip of sibling views.
 *
 * ## Why this is a real pager now
 *
 * An earlier version *nudged* the page: the content followed the finger 72pt
 * and stopped, and on release a different list appeared where the old one had
 * been. It was cheap — one list ever mounted — but it read as a gesture the app
 * had merely acknowledged rather than performed, because there was nothing to
 * slide *to*.
 *
 * A page can only slide in if it already exists, so this keeps the neighbours
 * mounted (`PAGE_WINDOW`) and moves the whole strip as one `translateX` on the
 * UI thread. The finger's travel *is* the animation: there is no moment where a
 * value has to catch up with it, which is what made the old version feel laggy.
 *
 * ## The position is continuous, and it is the only state
 *
 * `position` runs from `0` to `count - 1` in pages; page `i` sits at
 * `(i - position) * width`. Because the resting position of a page is an
 * integer and the drag produces a fraction, the release is a *spring* rather
 * than a swap — the animation has somewhere to go, and the state change is a
 * consequence of arriving rather than a precondition for it.
 *
 * The strip is committed on release, not when the spring finishes, so the chips
 * respond the instant the finger lifts while the page is still travelling. The
 * commit is what stops the incoming page from being one that React has not
 * rendered yet: `index` changes first, the window shifts, and the spring lands
 * on content that already exists.
 *
 * ## Why the gesture does not fight the list
 *
 * `activeOffsetX` keeps a vertical drag from ever activating it, and
 * `failOffsetY` gives the list the win the moment the finger moves up or down
 * first. A drag that starts horizontal belongs to this component; a drag that
 * starts vertical belongs to the `FlatList` underneath and is never
 * interrupted.
 *
 * ## What is mounted
 *
 * One page either side, and no more. These pages are `FlatList`s over thousands
 * of rows, not static cards — mounting all five so any of them could be dragged
 * toward would mean five lists measuring, five holding cells, and five scroll
 * positions to keep honest. A page two away from the finger cannot be reached
 * in one gesture, so it does not need to exist.
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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  SWIPE_ACTIVATION,
  pageDragPosition,
  pageTargetFor,
} from "@/lib/swipeNavigation";
import { spring, useMotionEnabled } from "@/theme/motion";

/** Pages on either side of the active one that keep their content mounted. */
const PAGE_WINDOW = 1;

export type SwipePagerProps = {
  /** Index of the page currently shown. */
  index: number;
  count: number;
  /** Called once a release has chosen a page — before it has finished landing. */
  onIndexChange: (next: number) => void;
  /** Builds one page's content. Called only for pages inside the window. */
  renderPage: (index: number) => ReactNode;
  /**
   * A shared value to write the strip's continuous position into, so a control
   * above it can travel with the drag.
   *
   * Supplied rather than exposed through a callback because the consumer needs
   * the number *on the UI thread*: the thumb of a segmented control is drawn in
   * the same frame as the page, and a value that had to round-trip through React
   * state would arrive a frame later — which reads as a thumb that lags the
   * content it is describing.
   */
  position?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
};

export function SwipePager({
  index,
  count,
  onIndexChange,
  renderPage,
  position: sharedPosition,
  style,
}: SwipePagerProps) {
  const motionEnabled = useMotionEnabled();
  const [width, setWidth] = useState(0);

  /**
   * Continuous position, in pages. See the note at the top.
   *
   * The local value is always created — hooks cannot be conditional — but it is
   * only used when the caller did not supply one.
   */
  const local = useSharedValue(index);
  const position = sharedPosition ?? local;
  /** Where the strip was when the finger landed. */
  const origin = useSharedValue(index);
  /**
   * How far the finger had already travelled when the drag activated.
   *
   * The pan only reports itself after `SWIPE_ACTIVATION` points, but its
   * `translationX` is measured from touch-down. Subtracting this is the
   * difference between a page that starts moving with the finger and one that
   * jumps sixteen points the instant the gesture is recognised.
   */
  const grab = useSharedValue(0);

  /**
   * The page the strip has already been *told* to be on.
   *
   * Two things move `index`: a release (which the strip has already animated
   * toward) and the outside world (a chip, a language being chosen). Only the
   * second one should move the strip, and this is how the effect below tells
   * them apart — otherwise every release would restart its own spring from
   * wherever it had got to.
   */
  const committed = useRef(index);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const commit = useCallback(
    (target: number) => {
      if (target === committed.current) {
        return;
      }
      committed.current = target;
      onIndexChange(target);
    },
    [onIndexChange],
  );

  /**
   * A page chosen from outside the gesture — a chip, the language sheet, a view
   * that disappeared when its language was cleared. The strip has to travel to
   * it the same way a swipe would, or tapping a chip would be the one page
   * change with no motion in it.
   */
  useEffect(() => {
    if (committed.current === index) {
      return;
    }
    committed.current = index;
    position.value = motionEnabled ? withSpring(index, spring.page) : index;
  }, [index, motionEnabled, position]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATION, SWIPE_ACTIVATION])
        .failOffsetY([-SWIPE_ACTIVATION, SWIPE_ACTIVATION])
        .onStart((event) => {
          origin.value = position.value;
          grab.value = event.translationX;
        })
        .onUpdate((event) => {
          if (!motionEnabled) {
            return;
          }
          position.value = pageDragPosition({
            start: origin.value,
            translationX: event.translationX - grab.value,
            width,
            count,
          });
        })
        .onEnd((event) => {
          const target = pageTargetFor({
            position: position.value,
            velocityX: event.velocityX,
            count,
          });
          if (!motionEnabled) {
            position.value = target;
          } else {
            // Carrying the release velocity is what makes the page continue
            // with the finger's momentum instead of starting to move on its
            // own — the difference between a pager and a slideshow. Points per
            // second become pages per second, and the sign flips because the
            // strip moves opposite to the finger.
            position.value = withSpring(target, {
              ...spring.page,
              velocity: width > 0 ? -event.velocityX / width : 0,
            });
          }
          scheduleOnRN(commit, target);
        }),
    [commit, count, grab, motionEnabled, origin, position, width],
  );

  const pages = useMemo(
    () => Array.from({ length: count }, (_, pageIndex) => pageIndex),
    [count],
  );

  return (
    <View style={[styles.host, style]} onLayout={onLayout}>
      {/* Nothing is drawn until the page width is known: every page is offset by
          a multiple of it, and a frame of five pages stacked on top of each
          other is a flash nobody should have to see. The layout pass that
          supplies it is the same one that would have positioned them. */}
      {width > 0 ? (
        <GestureDetector gesture={gesture}>
          <View style={styles.viewport} collapsable={false}>
            {pages.map((pageIndex) => (
              <PagerPage
                key={pageIndex}
                pageIndex={pageIndex}
                position={position}
                width={width}
                active={pageIndex === index}>
                {Math.abs(pageIndex - index) <= PAGE_WINDOW
                  ? renderPage(pageIndex)
                  : null}
              </PagerPage>
            ))}
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

type PagerPageProps = {
  pageIndex: number;
  position: SharedValue<number>;
  width: number;
  /** Whether this is the page the strip is on. */
  active: boolean;
  children: ReactNode;
};

/**
 * One layer of the strip.
 *
 * Its whole job is to sit at `(pageIndex - position) * width`, and to do it on
 * the UI thread — a page positioned from React state would move one render
 * behind the finger. `pointerEvents` follows the committed page rather than the
 * drawn one, so a tap during the landing animation reaches the page the
 * listener is arriving at, not the one leaving.
 */
function PagerPage({
  pageIndex,
  position,
  width,
  active,
  children,
}: PagerPageProps) {
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: (pageIndex - position.value) * width }],
    }),
    [pageIndex, width],
  );

  return (
    <Animated.View
      style={[styles.page, animatedStyle]}
      pointerEvents={active ? "auto" : "none"}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  page: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
