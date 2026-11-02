"use client";

/**
 * The wavy progress bar.
 *
 * Ported from `mobile/src/components/player/WavyProgress.tsx`, where it is the
 * app's word for "audio is moving". The played segment is a sine stroke that
 * travels to the right while audio is playing; the remaining segment is a flat,
 * lower-contrast line. A gap on each side of the thumb separates the two, so the
 * thumb reads as cut out of the track rather than sitting on top of it.
 *
 * `sweeping` turns the same stroke into an indeterminate one: a lit band travels
 * across the bar with nothing behind it, for a player that has been asked to play
 * and has nothing to report yet. A wait said in the same alphabet is a wait the
 * listener already understands — a second, unrelated spinner is not.
 *
 * ## What changed coming to the browser
 *
 * The phone draws in the UI thread with Reanimated; here the same shape is drawn
 * by writing `d` on two `<path>` elements from a `requestAnimationFrame` loop.
 * No React render per frame: the only state that changes 30 times a second lives
 * in a ref, which is what keeps the wave off the reconciler.
 *
 * Three rules are carried over unchanged, because each of them is a bug when it
 * is missing:
 *
 *   1. **When playback pauses the amplitude flattens over ~380 ms**, then the
 *      phase loop stops and the bar is completely idle. A flattening wave that
 *      kept its phase loop running redraws the screen forever for nothing.
 *   2. **Under the finger the wave flattens**, so the played portion follows the
 *      finger 1:1 instead of waving while being dragged.
 *   3. **Reduced motion gets no motion at all** — no band, no travel — and the
 *      bar falls back to a flat played line over a flat track, which still reads
 *      as a bar.
 */

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { buildWavePath, wavePhaseDelta } from "@/lib/waveform";

import { useMotionEnabled } from "../motion/use-motion-enabled";

/** Matches the house state-change timing; long enough to read as a settle. */
const FLATTEN_MS = 380;
/** The gap grows a little as the wave rises, so it never crowds the crest. */
const GAP_GROWTH = 2;
/**
 * The wave is decorative; a 60 Hz redraw of a sine path is not worth a frame.
 * 30 Hz still reads as continuous motion and halves the draw-phase work.
 */
const PHASE_INTERVAL_MS = 1000 / 30;
/** How much of the bar the travelling band occupies, as a share of its width. */
const SWEEP_BAND_RATIO = 0.34;
/**
 * One pass of the band. Slow on purpose: a fast sweep reads as a progress bar
 * that is nearly finished, and there is nothing to be nearly finished with.
 */
const SWEEP_PERIOD_MS = 2400;

/** `withTiming`'s curve, spelled out: the flatten is a settle, not a decay. */
function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

export type WavyProgressProps = {
  /** 0–1. Read in the draw phase, so a change does not need a render. */
  progress: number;
  isPlaying: boolean;
  /**
   * Draw an indeterminate travelling band instead of a played segment — for a
   * player that is fetching and cannot yet say how far through it is. The
   * `progress` value is ignored while this is set.
   */
  sweeping?: boolean;
  /** True while the listener is dragging; the wave flattens under the finger. */
  scrubbing?: boolean;
  /** Played segment colour. */
  tint: string;
  /** Unplayed segment colour, normally `var(--track)`. */
  trackColor: string;
  /** Stroke thickness, in pixels. */
  thickness?: number;
  /** Maximum distance from the centreline, in pixels. */
  amplitude?: number;
  /** Distance between crests, in pixels. */
  wavelength?: number;
  /** Height of the drawing band. Reserve the amplitude and it cannot jump. */
  bandHeight?: number;
  /** Half the thumb's width. Keeps the wave clamped like the thumb. */
  inset?: number;
  /** Distance from the playhead centre to each segment, in pixels. */
  gap?: number;
  className?: string;
};

type Config = {
  progress: number;
  isPlaying: boolean;
  sweeping: boolean;
  scrubbing: boolean;
  motion: boolean;
  amplitude: number;
  wavelength: number;
  bandHeight: number;
  inset: number;
  gap: number;
};

export function WavyProgress({
  progress,
  isPlaying,
  sweeping = false,
  scrubbing = false,
  tint,
  trackColor,
  thickness = 6,
  amplitude = 3,
  wavelength = 36,
  bandHeight = thickness + amplitude * 2 + 4,
  inset = 0,
  gap = 6,
  className,
}: WavyProgressProps) {
  const motionEnabled = useMotionEnabled();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playedRef = useRef<SVGPathElement | null>(null);
  const remainingRef = useRef<SVGPathElement | null>(null);

  /**
   * Props, refreshed in an effect on every render. The animation loop reads this
   * instead of closing over the props, so a position tick does not restart the
   * loop — and so the loop cannot draw a stale track after the listener changes
   * one. Written in an effect rather than during render: a ref mutated while
   * rendering is a value React is allowed to throw away, and the compiler is
   * right to refuse it.
   */
  const config = useRef<Config>({
    progress,
    isPlaying,
    sweeping,
    scrubbing,
    motion: true,
    amplitude,
    wavelength,
    bandHeight,
    inset,
    gap,
  });

  /** The values that change per frame. Never read during render. */
  const anim = useRef({
    width: 0,
    phase: 0,
    /** Current amplitude multiplier, 0–1. */
    amp: 0,
    ampFrom: 0,
    ampTarget: 0,
    ampStartedAt: 0,
    /** Where the travelling band is in its pass, 0–1. */
    sweep: 0,
    accumulator: 0,
  });

  /** The one place the two paths are written. Pure reads of `config`/`anim`. */
  const draw = useRef(() => {
    const played = playedRef.current;
    const remaining = remainingRef.current;
    if (!played || !remaining) {
      return;
    }

    const c = config.current;
    const a = anim.current;
    const width = a.width;
    const centerY = c.bandHeight / 2;
    const currentAmplitude = a.amp * c.amplitude;

    // A travelling band that slides in from the left edge and out through the
    // right. The window's own start is left negative on purpose: clamping it to
    // 0 would make the band appear at full width instead of growing into the
    // bar, which reads as a glitch rather than as something arriving.
    //
    // Reduced motion gets no band at all — the branch below then leaves the
    // plain track line in place so the bar still reads as a bar.
    if (c.sweeping && c.motion && width > 0) {
      const windowWidth = Math.max(1, width * SWEEP_BAND_RATIO);
      const rawStart = a.sweep * (width + windowWidth) - windowWidth;
      played.setAttribute(
        "d",
        buildWavePath({
          width,
          centerY,
          amplitude: currentAmplitude,
          wavelength: c.wavelength,
          phase: a.phase,
          startX: Math.max(0, rawStart),
          endX: Math.min(width, rawStart + windowWidth),
        }),
      );
      remaining.setAttribute("d", `M 0 ${centerY} L 0 ${centerY}`);
      remaining.setAttribute("opacity", "0");
      return;
    }

    const half = Math.min(c.inset, width / 2);
    const clamped = Math.max(0, Math.min(1, c.progress));
    const thumbX = width > 0 ? Math.min(Math.max(clamped * width, half), width - half) : 0;
    const currentGap = c.gap + a.amp * GAP_GROWTH;

    played.setAttribute(
      "d",
      buildWavePath({
        width,
        centerY,
        amplitude: currentAmplitude,
        wavelength: c.wavelength,
        phase: a.phase,
        endX: Math.max(0, thumbX - currentGap),
      }),
    );

    // The unplayed segment is drawn in the same SVG rather than as a positioned
    // element. Moving a box each frame re-runs layout; an SVG path is a
    // draw-phase update, like the wave itself.
    const start = Math.min(width, thumbX + currentGap);
    remaining.setAttribute("d", `M ${start} ${centerY} L ${width} ${centerY}`);
    remaining.setAttribute("opacity", start < width - 0.5 ? "1" : "0");
  });

  /** Re-derives the amplitude target and, on a change, restarts the settle. */
  const syncTarget = useRef((now: number) => {
    const c = config.current;
    const a = anim.current;
    // The target is only ever 0 or 1: the animated value is our own amplitude,
    // which drives the gap, while the stroke's amplitude is read from it.
    const target = c.motion && (c.isPlaying || c.sweeping) && !c.scrubbing ? 1 : 0;
    if (target !== a.ampTarget) {
      a.ampFrom = a.amp;
      a.ampStartedAt = now;
      a.ampTarget = target;
    }
  });

  /**
   * The commit hook: copy the props into the animation's own config, then draw.
   *
   * Declared *before* the loop so that, on a commit where both run, the loop
   * starts from the values that were just committed. It has no dependency array
   * on purpose — a paused bar still has to follow a seek, and a render is the
   * only signal it gets. Drawing here costs two attribute writes and keeps the
   * loop out of the paused case entirely.
   */
  useEffect(() => {
    config.current = {
      progress,
      isPlaying,
      sweeping,
      scrubbing,
      motion: motionEnabled,
      amplitude,
      wavelength,
      bandHeight,
      inset,
      gap,
    };
    syncTarget.current(performance.now());
    draw.current();
  });

  // Measure. A `ResizeObserver` rather than a one-off read: the bar is inside a
  // column that changes width with the sidebar and the viewport, and a wave
  // drawn to a stale width is a wave that ends before the thumb.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const apply = (width: number) => {
      anim.current.width = width;
      draw.current();
    };
    apply(host.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        apply(entry.contentRect.width);
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  /**
   * The loop. Runs while audio is moving, while the band is travelling, or while
   * the amplitude is still settling — the settle needs frames even though nothing
   * is playing, which is exactly the case a `useEffect` on `isPlaying` alone
   * would leave frozen mid-flatten.
   */
  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const a = anim.current;
      const c = config.current;
      const elapsed = Math.min(now - last, 50);
      last = now;

      syncTarget.current(now);

      a.accumulator += elapsed;
      if (a.accumulator >= PHASE_INTERVAL_MS) {
        // Advance by the time actually elapsed, not by one nominal frame, so the
        // wave keeps its speed when a frame is dropped.
        const step = a.accumulator;
        a.accumulator = 0;
        if (a.ampTarget > 0.5) {
          a.phase += wavePhaseDelta(step);
          // The band rides the same loop as the phase, so a waiting bar has one
          // motion on it rather than two that disagree about speed.
          if (c.sweeping) {
            a.sweep = (a.sweep + step / SWEEP_PERIOD_MS) % 1;
          }
        }
      }

      const settle = Math.min(1, (now - a.ampStartedAt) / FLATTEN_MS);
      a.amp = a.ampFrom + (a.ampTarget - a.ampFrom) * easeOutQuint(settle);

      draw.current();

      const settling = Math.abs(a.amp - a.ampTarget) > 0.001;
      if (a.ampTarget > 0.5 || settling) {
        frame = requestAnimationFrame(tick);
        return;
      }

      // Land exactly on the target before going idle, so a flat bar is flat
      // rather than 0.0004 of amplitude away from it.
      a.amp = a.ampTarget;
      draw.current();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, sweeping, scrubbing, motionEnabled]);

  return (
    <div
      ref={hostRef}
      className={cn("pointer-events-none relative w-full", className)}
      style={{ height: bandHeight }}
      aria-hidden
    >
      <svg
        width="100%"
        height={bandHeight}
        style={{ position: "absolute", inset: 0, display: "block" }}
      >
        <path
          ref={playedRef}
          stroke={tint}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          ref={remainingRef}
          stroke={trackColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
