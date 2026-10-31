"use client";

/**
 * The full player.
 *
 * The route is a view of the same store and the same engine as the bar; nothing
 * is mounted twice and navigating here does not interrupt a session. The screen
 * owns only UI state: which sheet is open and the sleep deadline.
 *
 * A local track gets a state, not a disabled control: the audio is on the
 * listener's phone, so there is nothing to play and nothing to apologise for.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { fa } from "@/lib/format";
import { playQueueAt, seek } from "@/lib/player/controller";
import {
  describeContextType,
  formatContextPosition,
} from "@/lib/player/playbackContext";
import { formatRemaining } from "@/lib/player/sleepTimer";
import type { PlaybackContext, PlayerTrack } from "@/lib/player/types";
import { usePlayerStore } from "@/stores/player";

import { AnnotationList } from "./annotation-list";
import type { TimelineMarker } from "./annotation-markers";
import { JumpToTimeSheet } from "./jump-to-time-sheet";
import { PlaybackStatusLine } from "./playback-status-line";
import { requestOpenNote, requestOpenQueue } from "./queue-events";
import { Scrubber } from "./scrubber";
import { SleepTimerSheet, useSleepTimer } from "./sleep-timer-sheet";
import { SpeedMenu } from "./speed-menu";
import { TrackArtwork } from "./track-artwork";
import { TransportControls } from "./transport-controls";
import { useBootPlayer } from "./use-player";
import { VolumeControl } from "./volume-control";

export function PlayerScreen({
  seed,
  seedPositionSec,
  seedFailed,
}: {
  seed: PlayerTrack | null;
  seedPositionSec: number | null;
  seedFailed: boolean;
}) {
  useBootPlayer();

  const current = usePlayerStore((state) => state.current);
  const context = usePlayerStore((state) => state.context);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const sleep = useSleepTimer();

  const [sleepOpen, setSleepOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [deepLinkError, setDeepLinkError] = useState(seedFailed);
  const seeded = useRef(false);
  const handleMarkers = useCallback((next: TimelineMarker[]) => setMarkers(next), []);

  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;

    if (!seed) {
      return;
    }
    if (usePlayerStore.getState().current !== null) {
      return;
    }

    void playQueueAt([seed], 0, {
      startPositionSec: seedPositionSec ?? 0,
      resumePin: seedPositionSec,
    });
  }, [seed, seedPositionSec]);

  if (!current) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[var(--space-xxl)]">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-sm)] py-[var(--space-xs)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text"
          >
            <Icon name="start" size="sm" />
            بازگشت
          </Link>
        </header>

        {deepLinkError ? (
          <p className="type-body rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-lg)] py-[var(--space-md)] text-text-secondary" role="status">
            این قطعه در کتابخانه پیدا نشد.
          </p>
        ) : null}

        <section className="flex flex-col items-center gap-[var(--space-md)] py-[var(--space-giant)] text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface text-text-tertiary">
            <Icon name="player" size="xl" />
          </span>
          <h1 className="type-title text-text">چیزی در حال پخش نیست</h1>
          <p className="type-body max-w-[44ch] text-text-secondary">
            از کتابخانه یا کاوش یک قطعه انتخاب کنید تا پخش و تاریخچهٔ شنیدن آغاز شود.
          </p>
          <div className="mt-[var(--space-sm)] flex flex-wrap justify-center gap-[var(--space-sm)]">
            <Button asChild variant="primary">
              <Link href="/library">کتابخانه</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/browse">کاوش</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const local = current.origin === "local";
  const overline = describeOverline(context, current, queueIndex, queueLength);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[var(--space-xxl)]">
      <header className="flex items-center justify-between gap-[var(--space-md)]">
        <Link
          href="/"
          className="inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-sm)] py-[var(--space-xs)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <Icon name="start" size="sm" />
          بازگشت
        </Link>

        <div className="flex items-center gap-[var(--space-xs)]">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="صف پخش"
            onClick={requestOpenQueue}
          >
            <Icon name="queue" size="md" />
          </button>
          <button
            type="button"
            className="relative grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="تایمر خواب"
            aria-expanded={sleepOpen}
            onClick={() => setSleepOpen(true)}
          >
            <Icon name="sleep" size="md" />
            {sleep.deadline !== null ? (
              <span className="type-numeric absolute -top-1 end-0 rounded-[var(--radius-pill)] bg-accent px-[var(--space-xs)] text-on-accent">
                {fa(formatRemaining(sleep.remainingMs))}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[360px]">
        <TrackArtwork track={current} className="aspect-square w-full rounded-[var(--radius-xl)]" />
      </div>

      <section className="flex flex-col gap-[var(--space-xs)] text-center">
        <p className="type-overline text-text-tertiary">{overline}</p>
        <h1 className="type-title text-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {current.title}
        </h1>
        <p className="type-caption text-text-secondary">
          {current.artist ?? current.albumTitle ?? "بیشناسه"}
        </p>
        {context ? (
          <Link
            href={context.type === "playlist" ? `/playlists/${context.key}` : "/browse"}
            className="type-caption mx-auto mt-[var(--space-xs)] inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-pill)] border border-outline-variant px-[var(--space-md)] py-[var(--space-xxs)] text-text-secondary hover:bg-surface-sunken hover:text-text"
          >
            {context.title}
            <Icon name="external" size="xs" />
          </Link>
        ) : null}
      </section>

      {deepLinkError ? (
        <p className="type-caption rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-md)] py-[var(--space-sm)] text-center text-text-secondary" role="status">
          این قطعه در کتابخانه پیدا نشد.
        </p>
      ) : null}

      {sleep.expired ? (
        <p className="type-caption text-center text-text-secondary" role="status">
          پخش با تایمر خواب متوقف شد.
        </p>
      ) : null}

      {!local ? (
        <>
          <Scrubber
            markers={markers}
            onSelectMarker={(marker) => {
              seek(marker.positionSec);
              setSelectedNote(marker.id);
              document
                .getElementById(`note-${marker.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
          <PlaybackStatusLine />
          <TransportControls />
        </>
      ) : (
        <div className="flex flex-col gap-[var(--space-md)]">
          <PlaybackStatusLine />
          <TransportControls />
        </div>
      )}

      <section aria-label="کنترل‌های بیشتر" className="flex flex-wrap items-center justify-center gap-[var(--space-sm)]">
        <SpeedMenu />
        <button
          type="button"
          className="inline-flex h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          onClick={() => setJumpOpen(true)}
          disabled={current.isLive}
        >
          <Icon name="clock" size="sm" />
          پرش به زمان
        </button>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          onClick={() => setSleepOpen(true)}
        >
          <Icon name="sleep" size="sm" />
          {sleep.deadline !== null ? `خواب ${fa(formatRemaining(sleep.remainingMs))}` : "تایمر خواب"}
        </button>
        {!local ? (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            onClick={requestOpenNote}
          >
            <Icon name="note" size="sm" />
            یادداشت
          </button>
        ) : null}
        <VolumeControl withSlider />
      </section>

      {!local ? (
        <AnnotationList
          contentHash={current.contentHash}
          serverId={current.serverId}
          durationSec={durationSec || current.durationSec}
          onSeek={seek}
          onMarkersChange={handleMarkers}
          selectedKey={selectedNote}
          onNoteDeleted={(key) => {
            setSelectedNote((currentKey) => (currentKey === key ? null : currentKey));
          }}
        />
      ) : null}

      <footer className="border-t border-outline-variant pt-[var(--space-md)]">
        <p className="type-caption text-center text-text-tertiary">
          Space پخش و توقف · ← → ۵ ثانیه · Shift + ← → ۳۰ ثانیه · ↑ ↓ صدا · M بی‌صدا · J / L ۱۰ ثانیه
        </p>
      </footer>

      <SleepTimerSheet open={sleepOpen} onOpenChange={setSleepOpen} timer={sleep} />
      <JumpToTimeSheet open={jumpOpen} onOpenChange={setJumpOpen} />
    </div>
  );
}

function describeOverline(
  context: PlaybackContext | null,
  current: PlayerTrack,
  index: number,
  length: number,
): string {
  if (context) {
    const position = formatContextPosition(index, length);
    return position
      ? `${describeContextType(context.type)} · ${position}`
      : describeContextType(context.type);
  }
  if (current.albumTitle) {
    return current.albumTitle;
  }
  if (current.origin === "local") {
    return "روی دستگاه شما";
  }
  return "آنلاین";
}
