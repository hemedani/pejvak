/**
 * The press interaction that the whole app is built on.
 *
 * Down: shrink to 0.92 with a fast spring, so the surface reads as "pressed"
 * before the finger has finished moving.
 * Up: snap to a 1.05 overshoot, then settle back to 1.0 with the house bouncy
 * spec (ζ = 0.6, stiffness 400).
 *
 * Two springs rather than one, because a single ζ = 0.6 spring released from
 * 0.92 only peaks around 1.008 — mathematically correct, visually flat. The
 * snap-up stage is what makes the overshoot actually visible; the settle stage
 * is what makes it feel physical.
 *
 * Springs never block the touch system, so targets stay responsive mid-animation.
 */

import { useCallback, type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { triggerHaptic, type HapticStyle } from "@/components/ui/haptics";
import { press, spring } from "@/theme/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ElasticPressableProps = Omit<
  PressableProps,
  "style" | "onPressIn" | "onPressOut" | "children"
> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale held while the finger is down. */
  scaleTo?: number;
  /** Peak scale on release, before settling back to 1. */
  overshootTo?: number;
  haptic?: HapticStyle;
  onPressIn?: PressableProps["onPressIn"];
  onPressOut?: PressableProps["onPressOut"];
};

export function ElasticPressable({
  children,
  style,
  scaleTo = press.down,
  overshootTo = press.overshoot,
  haptic = "light",
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: ElasticPressableProps) {
  const scale = useSharedValue<number>(press.rest);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn: NonNullable<PressableProps["onPressIn"]> = useCallback(
    (event) => {
      scale.value = withSpring(scaleTo, spring.press);
      triggerHaptic(haptic);
      onPressIn?.(event);
    },
    [haptic, onPressIn, scale, scaleTo],
  );

  const handlePressOut: NonNullable<PressableProps["onPressOut"]> = useCallback(
    (event) => {
      scale.value = withSequence(
        withSpring(overshootTo, spring.release),
        withSpring(press.rest, spring.bouncy),
      );
      onPressOut?.(event);
    },
    [onPressOut, overshootTo, scale],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
