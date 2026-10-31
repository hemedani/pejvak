"use client";

/**
 * The one line for waits, errors, the local-track state, and blocked autoplay.
 *
 * All of them occupy the same slot with `aria-live="polite"`: a wait that is
 * forty milliseconds long draws nothing (a loader that appears and vanishes is a
 * flicker), while a six-second wait earns a second sentence.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  describeWait,
  resolveWaitStage,
  WAIT_LONG_MS,
  WAIT_REVEAL_MS,
  type PlaybackWait,
  type WaitStage,
} from "@/lib/player/playbackPhase";
import { retry } from "@/lib/player/controller";
import { usePlayerStore } from "@/stores/player";

export function PlaybackStatusLine() {
  const waiting = usePlayerStore((state) => state.waiting);
  const error = usePlayerStore((state) => state.error);
  const blocked = usePlayerStore((state) => state.blocked);
  const current = usePlayerStore((state) => state.current);

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-[var(--space-md)]" role="alert">
        <p className="type-caption text-danger">پخش ممکن نشد. {error}</p>
        {current && current.origin !== "local" ? (
          <Button variant="secondary" size="sm" onClick={() => void retry()}>
            تلاش دوباره
          </Button>
        ) : null}
      </div>
    );
  }

  if (current?.origin === "local") {
    return (
      <p className="type-caption text-text-secondary" role="status">
        صدای این قطعه روی دستگاه شماست و در وب پخش نمی‌شود.
      </p>
    );
  }

  if (blocked) {
    return (
      <p className="type-caption text-text-secondary" role="status" aria-live="polite">
        برای شروع، پخش را بزنید.
      </p>
    );
  }

  if (waiting) {
    return <WaitLine key={waiting.since} waiting={waiting} />;
  }

  return <span className="type-caption text-text-tertiary" aria-hidden />;
}

/**
 * A separate component so a new wait mounts a new state machine. Resetting the
 * stage inside an effect for the previous wait would draw the old sentence for
 * one frame — exactly the kind of flicker the 400 ms threshold exists to avoid.
 */
function WaitLine({ waiting }: { waiting: PlaybackWait }) {
  const [stage, setStage] = useState<WaitStage>("hidden");

  useEffect(() => {
    const elapsed = Date.now() - waiting.since;
    const update = () => setStage(resolveWaitStage(Date.now() - waiting.since));
    const early = setTimeout(update, Math.max(0, WAIT_REVEAL_MS - elapsed));
    const late = setTimeout(update, Math.max(0, WAIT_LONG_MS - elapsed));
    return () => {
      clearTimeout(early);
      clearTimeout(late);
    };
  }, [waiting]);

  if (stage === "hidden") {
    return null;
  }

  const copy = describeWait(waiting, stage);
  return (
    <p className="type-caption text-text-secondary" role="status" aria-live="polite">
      {copy.label}
      {copy.detail ? <span className="text-text-tertiary"> {copy.detail}</span> : null}
    </p>
  );
}
