/**
 * Pejvak motion system.
 *
 * Every animation in the app is expressed with one of these specs so timing
 * feels like a single hand authored it. The house rules:
 *
 *   1. Physical where the finger is (presses, drags) — springs, never timings.
 *   2. Deliberate where the eye is (cross-fades, screen changes) — bezier curves.
 *   3. Nothing snaps. Every state change either springs or eases.
 *
 * Reanimated accepts `dampingRatio` (ζ) directly, so the specs below can be read
 * as physics rather than magic numbers: ζ = 1 is critically damped (no bounce),
 * ζ < 1 overshoots. The playback controls deliberately sit at ζ = 0.6.
 */

import { Easing, ReduceMotion, useReducedMotion, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

/**
 * Build a spring from its *physics* rather than its coefficients.
 *
 * Reanimated 4's `SpringConfig` treats `dampingRatio` and `stiffness` as
 * mutually exclusive, so we express the presets as (ratio, stiffness, mass) and
 * convert to the classical damping coefficient here:
 *
 *     c = 2 · ζ · √(k · m)
 *
 * This keeps the source readable as physics — `springSpec(0.6, 400)` is exactly
 * "damping ratio 0.6, stiffness 400" — while producing a config Reanimated
 * accepts. ζ = 1 is critically damped; ζ < 1 overshoots.
 */
export function springSpec(ratio: number, stiffness: number, mass = 1): WithSpringConfig {
  return {
    mass,
    stiffness,
    damping: 2 * ratio * Math.sqrt(stiffness * mass),
    reduceMotion: ReduceMotion.System,
  };
}

/** Spring presets, in the order a designer would reach for them. */
export const spring = {
  /**
   * The settle stage of a release, and the reference spec: ζ = 0.6, stiffness
   * 400. Used from the overshoot peak back to rest, where the remaining travel
   * is small enough that the damping reads as a soft landing rather than a lag.
   */
  bouncy: springSpec(0.6, 400),
  /**
   * The snap-up stage of a release: from the pressed scale to the overshoot
   * peak. Stiff and only lightly damped so the peak is reached in ~70 ms — a
   * spring this short reads as a snap, where a softer one reads as a stall.
   */
  release: springSpec(0.55, 1600, 0.8),
  /**
   * Press-down. Near critically damped and stiff: the finger wants confirmation
   * immediately, not a wobble on the way down.
   */
  press: springSpec(0.9, 1200, 0.8),
  /** Larger surfaces (album art, panels) — softer so the motion reads as weight. */
  gentle: springSpec(0.86, 210),
  /** The mini-player ↔ full-player morph. Firm enough to feel driven by the drag. */
  sheet: springSpec(0.82, 260),
  /** Snapping a dragged sheet open/closed. */
  snap: springSpec(0.9, 320),
  /** Small positional nudges (progress fill, marker travel). */
  snappy: springSpec(0.8, 640, 0.8),
} as const satisfies Record<string, WithSpringConfig>;

/** Bezier curves. Names describe the shape, not the numbers. */
export const easing = {
  /** cubic-bezier(0.34, 1.56, 0.64, 1) — anticipate then overshoot. Sheet content. */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** cubic-bezier(0.22, 1, 0.36, 1) — ease-out-quint. Navigation and reveals. */
  outQuint: Easing.bezier(0.22, 1, 0.36, 1),
  /** cubic-bezier(0.16, 1, 0.3, 1) — ease-out-expo. Hero entrances. */
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  /** cubic-bezier(0.2, 0, 0, 1) — Material "emphasized". Generic transitions. */
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  /** cubic-bezier(0.65, 0, 0.35, 1) — symmetric. Scrubbing, morphs driven by a value. */
  inOutSoft: Easing.bezier(0.65, 0, 0.35, 1),
  /** Linear — only for continuous, unbounded loops (shimmer). */
  linear: Easing.linear,
} as const;

export const duration = {
  /** Icon/colour swaps that must not be noticed. */
  instant: 120,
  quick: 180,
  base: 260,
  /** The 400 ms alpha cross-fade required when audio metadata changes. */
  crossfade: 400,
  /** Screen push/pop. */
  screen: 420,
  /** Ambient loops. */
  ambient: 9000,
} as const;

/** Scale ladder for the bouncy press interaction. */
export const press = {
  rest: 1,
  down: 0.92,
  overshoot: 1.05,
} as const;

/** Convenience timing config for a curved transition. */
export function curve(
  bezier: (typeof easing)[keyof typeof easing] = easing.outQuint,
  ms: number = duration.base,
): WithTimingConfig {
  return { duration: ms, easing: bezier, reduceMotion: ReduceMotion.System };
}

/** Stagger delay for a list revealing itself top-to-bottom. */
export function stagger(index: number, step = 45, max = 320): number {
  return Math.min(index * step, max);
}

/**
 * Whether the OS asks for reduced motion. Components should drop to a plain
 * cross-fade (or no motion) when this is true.
 */
export function useMotionEnabled(): boolean {
  const reduced = useReducedMotion();
  return !reduced;
}
