/**
 * The morphing now-playing container.
 *
 * This is the shared-element illusion. The sheet is a single full-screen-sized
 * container whose *frame* animates from the collapsed mini-player rectangle to
 * the full screen:
 *
 *   · width / height grow from the bar's measured size to the window size
 *   · the frame translates from the bar's origin to (0, 0)
 *   · the corner radius interpolates 28 → 0, so the rounded mini-player edges
 *     straighten out into full-screen ones
 *   · the dynamic canvas fades in over the first ~18% of the morph, and the
 *     player content reveals itself from ~16% onward
 *
 * At progress 0 the container sits exactly on top of the mini-player and is
 * fully transparent, so you are looking at the real bar — which is why the
 * transition starts with a pixel-perfect match instead of a lookalike. Only the
 * frame is animated; the content layers are absolutely positioned, so nothing
 * inside reflows per frame.
 *
 * Dragging the header down drives the same `progress` value in reverse, and
 * releasing past a threshold dismisses the route.
 */

import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { DynamicCanvas } from "@/components/motion/DynamicCanvas";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { useNowPlayingStore } from "@/store/nowPlayingStore";
import { usePlayerStore } from "@/store/playerStore";
import { curve, duration, easing, spring, useMotionEnabled } from "@/theme/motion";
import { layout, radius as radii, type AuroraRamp } from "@/theme/tokens";

/** The pan gesture the sheet builds, so `PlayerContent` can attach it. */
export type SheetGesture = ReturnType<typeof Gesture.Pan>;

export type NowPlayingSheetRenderArgs = {
  /** Attach to the header so the sheet can be dragged down to dismiss. */
  gesture: SheetGesture;
  /** 0 = collapsed over the mini-player, 1 = full screen. */
  reveal: SharedValue<number>;
  /** Collapse the sheet and pop the route, with the exit animation. */
  close: () => void;
};

export type NowPlayingSheetProps = {
  ramp: AuroraRamp;
  children: (args: NowPlayingSheetRenderArgs) => ReactNode;
};

export function NowPlayingSheet({ ramp, children }: NowPlayingSheetProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const anchor = useNowPlayingStore((state) => state.anchor);
  const expand = usePlayerStore((state) => state.expand);
  const collapse = usePlayerStore((state) => state.collapse);
  const motionEnabled = useMotionEnabled();

  const progress = useSharedValue(0);

  // Fall back to a plausible bar position when there is no measurement yet
  // (a deep link straight into the player, for instance).
  const collapsed = useMemo(
    () =>
      anchor ?? {
        x: layout.floatInset,
        y: height - layout.miniPlayerHeight - 150,
        width: width - layout.floatInset * 2,
        height: layout.miniPlayerHeight,
      },
    [anchor, height, width],
  );

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

  /**
   * Collapse the sheet, then pop the route once the reverse morph has finished.
   *
   * Popping first would tear the sheet down mid-animation and skip the exit
   * entirely, so the frame is driven back to 0 and `dismiss` runs from the
   * timing callback. Under reduced motion there is no morph to wait for.
   */
  const close = useCallback(() => {
    if (!motionEnabled) {
      dismiss();
      return;
    }
    progress.value = withTiming(
      0,
      curve(easing.outQuint, duration.base),
      (finished) => {
        if (finished) {
          scheduleOnRN(dismiss);
        }
      },
    );
  }, [dismiss, motionEnabled, progress]);

  useEffect(() => {
    expand();
    progress.value = motionEnabled ? withSpring(1, spring.sheet) : 1;
    return () => collapse();
  }, [collapse, expand, motionEnabled, progress]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Only react to a deliberate downward drag, so a tap on the close button
        // or a small wobble never starts a dismiss.
        .activeOffsetY([-9999, 14])
        .onUpdate((event) => {
          progress.value = Math.max(0, Math.min(1, 1 - event.translationY / (height * 0.55)));
        })
        .onEnd((event) => {
          const shouldDismiss = event.translationY > height * 0.18 || event.velocityY > 900;
          if (shouldDismiss) {
            close();
          } else {
            progress.value = withSpring(1, spring.sheet);
          }
        }),
    [close, height, progress],
  );

  const containerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      width: collapsed.width + (width - collapsed.width) * p,
      height: collapsed.height + (height - collapsed.height) * p,
      transform: [
        { translateX: collapsed.x * (1 - p) },
        { translateY: collapsed.y * (1 - p) },
      ],
      // Clamped: the spring overshoots past p = 1, and a negative radius is
      // invalid. At p > 1 the frame is already larger than the window, so
      // clamping to 0 is exactly the full-screen edge.
      borderRadius: Math.max(0, radii.panel * (1 - p)),
    };
  });

  const canvasStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value / 0.18),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (progress.value - 0.16) / 0.26)),
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.55,
  }));

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      />

      <Animated.View style={[styles.container, containerStyle]}>
        {/* Target for the glass controls that sit on top of the artwork — the
            close button, the chips, the transport row. The canvas keeps its own
            fade-in by living inside the target as an animated layer. */}
        <GlassBlurTarget
          style={StyleSheet.absoluteFill}
          background={
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, canvasStyle]}>
              <DynamicCanvas ramp={ramp} scrim={0.34} bottomScrim={0.9} />
            </Animated.View>
          }>
          <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
            {children({ gesture: pan, reveal: progress, close })}
          </Animated.View>
        </GlassBlurTarget>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: "#000000",
  },
  container: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
});
