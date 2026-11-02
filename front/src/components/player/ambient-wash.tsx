"use client";

/**
 * The ambient wash.
 *
 * Two soft radial glows tinted by the current track's palette, sitting behind the
 * player's content. Ported in spirit from
 * `mobile/src/components/motion/AmbientWash.tsx` and `DynamicCanvas.tsx`: on the
 * phone the whole now-playing screen is painted from the track, which is what
 * makes a player feel like it belongs to what is playing rather than to the app.
 *
 * ## What changed coming to the browser
 *
 * The phone fades a whole gradient canvas; the web paints *under* a light
 * interface that has to stay readable, so the wash is a tint at a fixed low alpha
 * and never a surface. It is deliberately motionless — an endless drift behind
 * every screen is a continuous cost for a change the listener only notices when
 * it stops — and it is `pointer-events-none` and `aria-hidden`, so it is scenery
 * and nothing else.
 *
 * ## The cross-fade needs no state
 *
 * `background-image` cannot be transitioned, but a registered custom property can
 * (`.wash` in `globals.css`). So the two tint stops are `--wash-a` / `--wash-b`,
 * and changing track interpolates the gradient's colours in place: one element,
 * no second layer, no `setState` in an effect, nothing to clean up when a
 * listener skips through a queue. Browsers without `@property` snap from one
 * colour to the next, which is the behaviour this had before and no worse.
 */

import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";
import { paletteFor, withAlpha } from "@/lib/palette";

export function AmbientWash({
  contentHash,
  /** 0–1 multiplier on the glow alpha. Lower it on a screen with dense copy. */
  intensity = 1,
  className,
}: {
  contentHash: string;
  intensity?: number;
  className?: string;
}) {
  const ramp = paletteFor(contentHash);

  const style = {
    "--wash-a": withAlpha(ramp[1], 0.26 * intensity),
    "--wash-b": withAlpha(ramp[0], 0.18 * intensity),
  } as CSSProperties;

  return (
    <div
      aria-hidden
      className={cn("wash pointer-events-none absolute inset-0 -z-10", className)}
      style={style}
    />
  );
}
