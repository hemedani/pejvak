/**
 * An inline sheet that springs into place.
 *
 * The animated style is applied to a wrapper `Animated.View` rather than to the
 * glass surface itself: `GlassSurface` renders a plain (non-animated) host, so
 * animating a wrapper is what actually drives the transform every frame while
 * the child sizes itself normally from its content.
 *
 * Opening springs (so it lands with weight); closing eases out quickly, because
 * a spring on the way out feels sluggish.
 */

import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { curve, duration, easing, spring, useMotionEnabled } from "@/theme/motion";

import { GlassSurface, type GlassSurfaceProps } from "./GlassSurface";

export type GlassSheetProps = GlassSurfaceProps & {
  open: boolean;
};

export function GlassSheet({ open, style, children, ...props }: GlassSheetProps) {
  const motionEnabled = useMotionEnabled();
  const visibility = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (!motionEnabled) {
      visibility.value = open ? 1 : 0;
      return;
    }
    visibility.value = open
      ? withSpring(1, spring.sheet)
      : withTiming(0, curve(easing.outQuint, duration.quick));
  }, [motionEnabled, open, visibility]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [
      { translateY: (1 - visibility.value) * 22 },
      { scale: 0.975 + visibility.value * 0.025 },
    ],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <GlassSurface style={style} {...props}>
        {children}
      </GlassSurface>
    </Animated.View>
  );
}
