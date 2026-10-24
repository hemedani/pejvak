/**
 * Staggered entrance for list items, cards and sections.
 *
 * `index` drives the delay so a column of rows settles top-to-bottom instead of
 * appearing all at once. The delay is capped so long lists do not make the last
 * row wait.
 *
 * Inside a virtualised list, pass `limit` — see the prop doc. Reanimated's
 * entering animations replay whenever a component remounts, and a recycled row
 * is a remount.
 */

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  ReduceMotion,
} from "react-native-reanimated";

import { duration, easing, stagger, useMotionEnabled } from "@/theme/motion";

export type RevealFrom = "below" | "above" | "right" | "fade";

export type RevealProps = {
  children: ReactNode;
  /** Position in its list; drives the stagger delay. */
  index?: number;
  from?: RevealFrom;
  /**
   * Highest `index` that still animates — anything at or past it renders
   * immediately. Defaults to `Infinity`, which is right for static layouts
   * (sections of a detail screen, a settings list) because those mount once.
   *
   * Virtualised lists are different: a `FlatList` recycles its rows, and a
   * recycled row replays its entering animation. Because `stagger` is capped, a
   * row that mounts by scrolling would sit invisible for up to 320 ms before
   * fading in — that reads as a gap, not a reveal. Pass a `limit` covering
   * roughly the opening screenful so rows scrolled into view later are simply
   * already there.
   */
  limit?: number;
  style?: StyleProp<ViewStyle>;
};

function builderFor(from: RevealFrom) {
  switch (from) {
    case "above":
      return FadeInDown;
    case "right":
      return FadeInRight;
    case "fade":
      return FadeIn;
    case "below":
    default:
      return FadeInUp;
  }
}

/**
 * A row past the animated range does not need an `Animated.View` at all.
 *
 * `limit` already says "this row renders immediately"; wrapping it anyway cost a
 * view and, worse, ran `useMotionEnabled` on every recycled row that never
 * animates. Returning the children directly makes the non-animated path free.
 * `index` is stable per row, so a row never crosses the boundary and changes
 * element type underneath the list.
 */
export function Reveal({
  children,
  index = 0,
  from = "below",
  limit = Infinity,
  style,
}: RevealProps) {
  if (index >= limit) {
    return <>{children}</>;
  }
  return (
    <AnimatedReveal index={index} from={from} style={style}>
      {children}
    </AnimatedReveal>
  );
}

function AnimatedReveal({
  children,
  index = 0,
  from = "below",
  style,
}: RevealProps) {
  const motionEnabled = useMotionEnabled();

  const entering = motionEnabled
    ? builderFor(from)
        .delay(stagger(index))
        .duration(duration.screen)
        .easing(easing.outQuint)
        .reduceMotion(ReduceMotion.Never)
    : FadeIn.duration(duration.instant).reduceMotion(ReduceMotion.Never);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
