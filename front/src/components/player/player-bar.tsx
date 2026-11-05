"use client";

/**
 * The persistent bar.
 *
 * It floats over the shell and is glass because it does (`AGENTS.md`, two
 * materials); the content it covers is still the reader's. The bar carries the
 * transport and the way back into the full player, not a second scrubber:
 * a 4 px progress hairline answers "how far" without turning the bar into the
 * screen.
 *
 * The queue sheet is mounted here, once, so the sidebar slot and the full
 * player can ask for the same sheet.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { formatClock } from "@/lib/time";
import { closePlayer } from "@/lib/player/controller";
import { progressRatio } from "@/lib/player/progressSmoothing";
import { usePlayerStore } from "@/stores/player";

import { OPEN_QUEUE_EVENT } from "./queue-events";
import { PlaybackStatusLine } from "./playback-status-line";
import { QueueSheet } from "./queue-sheet";
import { SpeedMenu } from "./speed-menu";
import { TrackArtwork } from "./track-artwork";
import { TransportControls } from "./transport-controls";
import { useBootPlayer, usePlayerKeyboard } from "./use-player";
import { VolumeControl } from "./volume-control";
import { WavyProgress } from "./wavy-progress";

export function PlayerBar() {
  useBootPlayer();
  usePlayerKeyboard();

  const current = usePlayerStore((state) => state.current);
  const pathname = usePathname();
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener(OPEN_QUEUE_EVENT, open);
    return () => window.removeEventListener(OPEN_QUEUE_EVENT, open);
  }, []);

  // The full player screen at `/player` is the same store and the same engine;
  // showing the mini bar there is an unnecessary repetition of what the screen
  // already shows. The queue sheet stays mounted so the full player can still
  // request it.
  const onPlayerRoute = pathname === "/player";
  const barVisible = current !== null && !onPlayerRoute;

  // Toggle a data attribute on `<body>` so the shell's `<main>` can adjust its
  // bottom padding. The `--layout-player-bar` height reserved for the bar is
  // only needed when the bar is actually shown — without this, the player route
  // has a strip of dead space where the bar would have been.
  useEffect(() => {
    document.body.dataset.playerBar = barVisible ? "visible" : "hidden";
    return () => {
      delete document.body.dataset.playerBar;
    };
  }, [barVisible]);

  if (!current || onPlayerRoute) {
    return <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 lg:ms-[var(--layout-sidebar)]" data-player-surface>
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass)] shadow-[var(--elevation-float)] backdrop-blur-xl">
          <BarProgress />
          <div className="mx-auto flex min-h-[var(--layout-player-bar)] w-full max-w-[var(--layout-content)] items-center gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-sm)] lg:px-[var(--space-xxl)]">
            <Link
              href="/player"
              className="flex min-w-0 flex-1 items-center gap-[var(--space-md)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-none sm:w-64"
            >
              <TrackArtwork track={current} className="size-12" />
              <span className="min-w-0">
                <span dir="auto" className="type-label block truncate text-text">{current.title}</span>
                <span dir="auto" className="type-caption block truncate text-text-secondary">
                  {current.artist ?? (current.origin === "local" ? "On your device" : "Unknown artist")}
                </span>
              </span>
            </Link>

            <div className="hidden min-w-0 flex-1 flex-col items-center gap-[var(--space-xxs)] sm:flex">
              <TransportControls compact />
              <div className="max-w-full truncate">
                <PlaybackStatusLine />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-[var(--space-xs)]">
              <div className="hidden md:block">
                <SpeedMenu compact />
              </div>
              <div className="hidden md:block">
                <VolumeControl />
              </div>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="Playback queue"
                onClick={() => setQueueOpen(true)}
              >
                <Icon name="queue" size="md" />
              </button>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="Close the player"
                onClick={closePlayer}
              >
                <Icon name="close" size="md" />
              </button>
            </div>
          </div>

          <div className="px-[var(--space-lg)] pb-[var(--space-sm)] sm:hidden">
            <TransportControls compact />
          </div>
        </div>
      </div>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </>
  );
}

/** A hairline of progress — drawn as the same wave the player screen uses. */
function BarProgress() {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const playing = usePlayerStore((state) => state.status === "playing");
  const waiting = usePlayerStore((state) => state.waiting !== null);
  const isLive = usePlayerStore((state) => state.current?.isLive === true);
  const ratio = isLive ? 1 : progressRatio(positionSec, durationSec);

  return (
    <div
      className="absolute inset-x-0 top-0"
      role="progressbar"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={durationSec > 0 ? durationSec : undefined}
      aria-valuenow={durationSec > 0 ? Math.min(positionSec, durationSec) : undefined}
      aria-valuetext={
        durationSec > 0 ? `${formatClock(positionSec)} of ${formatClock(durationSec)}` : undefined
      }
    >
      {/*
        The same stroke at a quarter of the height. The bar is not a second
        scrubber — it answers "how far" and nothing else — but it answers in the
        app's own word for audio moving, so a paused bar is visibly still and a
        loading one visibly travels.
      */}
      <WavyProgress
        progress={ratio}
        isPlaying={playing}
        sweeping={waiting}
        tint="var(--accent)"
        trackColor="var(--track)"
        thickness={2}
        amplitude={1.4}
        wavelength={22}
        bandHeight={8}
        gap={0}
      />
    </div>
  );
}
