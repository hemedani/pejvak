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

import { triggerHaptic, type HapticIntent } from "@/components/ui/haptics";
import { press, spring, useMotionEnabled } from "@/theme/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ElasticPressableProps = Omit<
  PressableProps,
  "style" | "onPressIn" | "onPressOut" | "onPress" | "children"
> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale held while the finger is down. */
  scaleTo?: number;
  /** Peak scale on release, before settling back to 1. */
  overshootTo?: number;
  haptic?: HapticIntent;
  onPress?: PressableProps["onPress"];
  onPressIn?: PressableProps["onPressIn"];
  onPressOut?: PressableProps["onPressOut"];
};

export function ElasticPressable({
  children,
  style,
  scaleTo = press.down,
  overshootTo = press.overshoot,
  haptic = "tap",
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: ElasticPressableProps) {
  const scale = useSharedValue<number>(press.rest);
  const motionEnabled = useMotionEnabled();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn: NonNullable<PressableProps["onPressIn"]> = useCallback(
    (event) => {
      scale.value = motionEnabled ? withSpring(scaleTo, spring.press) : scaleTo;
      onPressIn?.(event);
    },
    [motionEnabled, onPressIn, scale, scaleTo],
  );

  const handlePress: NonNullable<PressableProps["onPress"]> = useCallback(
    (event) => {
      if (!disabled) {
        triggerHaptic(haptic);
      }
      onPress?.(event);
    },
    [disabled, haptic, onPress],
  );

  const handlePressOut: NonNullable<PressableProps["onPressOut"]> = useCallback(
    (event) => {
      scale.value = motionEnabled
        ? withSequence(
            withSpring(overshootTo, spring.release),
            withSpring(press.rest, spring.bouncy),
          )
        : press.rest;
      onPressOut?.(event);
    },
    [motionEnabled, onPressOut, overshootTo, scale],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
