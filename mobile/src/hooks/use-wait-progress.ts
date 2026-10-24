/**
 * How far a wait has got, in the two steps a listener needs to hear about.
 *
 * Not a clock. The copy changes at most twice — once when the wait has lasted
 * long enough to be worth admitting to, once when it has lasted long enough to
 * need explaining — so the player schedules exactly those two moments instead
 * of re-rendering the whole screen once a second to discover that nothing has
 * changed. The position tick already owns the per-second redraw.
 */

import { useEffect, useState } from "react";

import {
  WAIT_STEPS,
  type PlaybackWait,
  type WaitStage,
} from "@/lib/playbackPhase";

type Reached = { since: number; stage: WaitStage };

export function useWaitProgress(wait: PlaybackWait | null): WaitStage {
  const since = wait?.since ?? null;
  const [reached, setReached] = useState<Reached | null>(null);

  useEffect(() => {
    if (since === null) {
      return;
    }
    // Measured from the wait's own timestamp rather than from mount, so a
    // screen opened halfway through a wait shows the stage that wait is
    // actually in. A boundary already behind us fires at zero, which is what
    // makes that case land on the right word immediately.
    const elapsed = Date.now() - since;
    const timers = WAIT_STEPS.map((step) =>
      setTimeout(
        () => setReached({ since, stage: step.stage }),
        Math.max(0, step.atMs - elapsed),
      ),
    );
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [since]);

  if (since === null) {
    return "hidden";
  }
  // A stage recorded for a previous wait says nothing about this one.
  return reached?.since === since ? reached.stage : "hidden";
}
