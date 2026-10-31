"use client";

/**
 * Transport controls.
 *
 * The play control is the only filled accent circle in a surface: a filled
 * accent circle means "the current thing", the same rule as the mobile dock. A
 * wait keeps the press and swaps the glyph for a spinner, so the control that
 * started the wait is also the control that can end it.
 */

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { next, pause, play, previous, seekBy } from "@/lib/player/controller";
import { usePlayerStore } from "@/stores/player";

export function TransportControls({ compact = false }: { compact?: boolean }) {
  const status = usePlayerStore((state) => state.status);
  const waiting = usePlayerStore((state) => state.waiting);
  const current = usePlayerStore((state) => state.current);

  if (!current) {
    return null;
  }

  const local = current.origin === "local";
  const live = current.isLive;
  const playing = status === "playing";
  const waitingNow = waiting !== null;
  const playLabel = waitingNow ? "توقف انتظار" : playing ? "توقف" : "پخش";

  const onPlay = () => {
    if (waitingNow || playing) {
      pause();
    } else {
      void play();
    }
  };

  return (
    <div
      className={cn("flex items-center justify-center", compact ? "gap-[var(--space-sm)]" : "gap-[var(--space-lg)]")}
      data-player-surface
    >
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label="قطعهٔ قبلی"
        aria-keyshortcuts="Control+ArrowLeft"
        onClick={() => void previous()}
      >
        <Icon name="previous" size={compact ? "md" : "lg"} />
      </button>

      {!compact && !local ? (
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
          aria-label="۳۰ ثانیه عقب"
          disabled={live}
          onClick={() => seekBy(-30)}
        >
          <Icon name="rewind" size="lg" />
        </button>
      ) : null}

      {!local ? (
        <button
          type="button"
          className={cn(
            "grid place-items-center rounded-full bg-accent text-on-accent shadow-[var(--elevation-card)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            compact ? "size-11" : "size-14",
          )}
          aria-label={playLabel}
          aria-keyshortcuts="Space"
          aria-busy={waitingNow}
          onClick={onPlay}
        >
          {waitingNow ? (
            <Spinner />
          ) : (
            <Icon name={playing ? "pause" : "play"} size={compact ? "md" : "lg"} />
          )}
        </button>
      ) : null}

      {!compact && !local ? (
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
          aria-label="۳۰ ثانیه جلو"
          disabled={live}
          onClick={() => seekBy(30)}
        >
          <Icon name="forward" size="lg" />
        </button>
      ) : null}

      <button
        type="button"
        className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label="قطعهٔ بعدی"
        aria-keyshortcuts="Control+ArrowRight"
        onClick={() => void next()}
      >
        <Icon name="next" size={compact ? "md" : "lg"} />
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-on-accent/40 border-t-on-accent"
    />
  );
}
