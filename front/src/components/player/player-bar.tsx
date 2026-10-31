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
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { formatClockFa } from "@/lib/format";
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

export function PlayerBar() {
  useBootPlayer();
  usePlayerKeyboard();

  const current = usePlayerStore((state) => state.current);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener(OPEN_QUEUE_EVENT, open);
    return () => window.removeEventListener(OPEN_QUEUE_EVENT, open);
  }, []);

  if (!current) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 lg:ms-[248px]" data-player-surface>
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass)] shadow-[var(--elevation-float)] backdrop-blur-xl">
          <BarProgress />
          <div className="mx-auto flex min-h-[76px] w-full max-w-[1180px] items-center gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-sm)] lg:px-[var(--space-xxl)]">
            <Link
              href="/player"
              className="flex min-w-0 flex-1 items-center gap-[var(--space-md)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-none sm:w-64"
            >
              <TrackArtwork track={current} className="size-12" />
              <span className="min-w-0">
                <span className="type-label block truncate text-text">{current.title}</span>
                <span className="type-caption block truncate text-text-secondary">
                  {current.artist ?? (current.origin === "local" ? "روی دستگاه شما" : "بیشناسه")}
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
                aria-label="صف پخش"
                onClick={() => setQueueOpen(true)}
              >
                <Icon name="queue" size="md" />
              </button>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="بستن پخش‌کننده"
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

/** A hairline of progress. Selects only the two numbers it draws. */
function BarProgress() {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const isLive = usePlayerStore((state) => state.current?.isLive === true);
  const ratio = isLive ? 1 : progressRatio(positionSec, durationSec);

  return (
    <div
      className="absolute inset-x-0 top-0 h-[2px] bg-track"
      role="progressbar"
      aria-label="پیشرفت پخش"
      aria-valuemin={0}
      aria-valuemax={durationSec > 0 ? durationSec : undefined}
      aria-valuenow={durationSec > 0 ? Math.min(positionSec, durationSec) : undefined}
      aria-valuetext={
        durationSec > 0 ? `${formatClockFa(positionSec)} از ${formatClockFa(durationSec)}` : undefined
      }
    >
      <span
        className="absolute inset-y-0 bg-accent"
        style={{ inlineSize: `${ratio * 100}%`, insetInlineStart: 0 }}
      />
    </div>
  );
}
