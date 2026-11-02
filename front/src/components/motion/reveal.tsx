/**
 * Staggered entrance for cards and rows.
 *
 * A dashboard that appears all at once reads as a page that was already there; a
 * column that settles top-to-bottom reads as a page that was assembled for you.
 * `index` drives the delay, capped so the last card of a long grid does not wait
 * — past roughly a third of a second a reveal is a loading state, not a flourish.
 *
 * ## Two details that are not taste
 *
 *   · **`backwards`, not `both`.** The fill mode decides what happens *after*
 *     the animation: `both` would leave a `transform` on every card forever, and
 *     a transform makes an element a containing block — the day a card holds
 *     something `fixed`, it silently stops being fixed. `backwards` holds the
 *     `from` frame during the delay and then gets out of the way.
 *   · **Reduced motion kills the delay, not just the duration** (`globals.css`).
 *     With a delay and a fill mode, a collapsed duration alone leaves the element
 *     invisible until the stagger reaches it.
 *
 * This is CSS only: no JavaScript, no observer, nothing to re-run on scroll. It
 * runs once per mount, which is what a route change is.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Delay between two neighbours. Small enough that ten of them are 450 ms. */
const STEP_MS = 45;
/** Past this index the delay stops growing — the rest arrive together. */
const MAX_STEPS = 10;

export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const step = Math.min(Math.max(0, index), MAX_STEPS);
  return (
    <div
      className={cn(
        "animate-[reveal-up_320ms_cubic-bezier(0.22,1,0.36,1)_backwards]",
        className,
      )}
      style={step > 0 ? { animationDelay: `${step * STEP_MS}ms` } : undefined}
    >
      {children}
    </div>
  );
}
