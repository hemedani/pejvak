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

import { ContextHistoryButton } from "@/components/domain/context-history-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { playQueueAt, seek } from "@/lib/player/controller";
import {
  describeContextType,
  formatContextPosition,
} from "@/lib/player/playbackContext";
import { formatRemaining } from "@/lib/player/sleepTimer";
import type { PlaybackContext, PlayerTrack } from "@/lib/player/types";
import { usePlayerStore } from "@/stores/player";

import { AmbientWash } from "./ambient-wash";
import { AnnotationList } from "./annotation-list";
import type { TimelineMarker } from "./annotation-markers";
import { JumpToTimeSheet } from "./jump-to-time-sheet";
import { PlaybackStatusLine } from "./playback-status-line";
import { PlayerMoreMenu } from "./player-more-menu";
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
            Back
          </Link>
        </header>

        {deepLinkError ? (
          <p className="type-body rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-lg)] py-[var(--space-md)] text-text-secondary" role="status">
            That track could not be found in your library.
          </p>
        ) : null}

        <section className="flex flex-col items-center gap-[var(--space-md)] py-[var(--space-giant)] text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface text-text-tertiary">
            <Icon name="player" size="xl" />
          </span>
          <h1 className="type-title text-text">Nothing is playing</h1>
          <p className="type-body max-w-[44ch] text-text-secondary">
            Pick something from your library or Browse to start playback and begin your listening history.
          </p>
          <div className="mt-[var(--space-sm)] flex flex-wrap justify-center gap-[var(--space-sm)]">
            <Button asChild variant="primary">
              <Link href="/library">
              Library
            </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/browse">
              Browse
            </Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const local = current.origin === "local";
  const overline = describeOverline(context, current, queueIndex, queueLength);
  const sleepLabel =
    sleep.deadline !== null ? `Sleep ${formatRemaining(sleep.remainingMs)}` : "Sleep timer";

  return (
    <div className="relative isolate mx-auto flex w-full max-w-[760px] flex-col gap-[var(--space-xxl)]">
      {/*
        The track's own colour, behind everything and under nothing. `isolate`
        is load-bearing: without a stacking context on this box, a `-z-10` layer
        would paint behind the page canvas and disappear.
      */}
      <AmbientWash contentHash={current.contentHash} />

      <header className="flex items-center justify-between gap-[var(--space-md)]">
        <Link
          href="/"
          className="inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-sm)] py-[var(--space-xs)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <Icon name="start" size="sm" />
            Back
          </Link>

        <div className="flex items-center gap-[var(--space-xs)]">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Playback queue"
            onClick={requestOpenQueue}
          >
            <Icon name="queue" size="md" />
          </button>
          <button
            type="button"
            className="relative grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Sleep timer"
            aria-expanded={sleepOpen}
            onClick={() => setSleepOpen(true)}
          >
            <Icon name="sleep" size="md" />
            {sleep.deadline !== null ? (
              <span className="type-numeric absolute -top-1 end-0 rounded-[var(--radius-pill)] bg-accent px-[var(--space-xs)] text-on-accent">
                {formatRemaining(sleep.remainingMs)}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[360px]">
        <TrackArtwork track={current} className="aspect-square w-full rounded-[var(--radius-xl)]" />
      </div>

      <section className="flex flex-col gap-[var(--space-xs)] text-center">
        <p dir="auto" className="type-kicker text-text-tertiary">{overline}</p>
        <h1 dir="auto" className="type-title text-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {current.title}
        </h1>
        <p dir="auto" className="type-caption text-text-secondary">
          {current.artist ?? current.albumTitle ?? "Unknown artist"}
        </p>
        {context ? (
          <div className="mt-[var(--space-xs)] flex flex-wrap items-center justify-center gap-[var(--space-sm)]">
            <Link
              dir="auto"
              href={context.type === "playlist" ? `/playlists/${context.key}` : "/browse"}
              className="type-caption inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-pill)] border border-outline-variant px-[var(--space-md)] py-[var(--space-xxs)] text-text-secondary hover:bg-surface-sunken hover:text-text"
            >
              {context.title}
              <Icon name="external" size="xs" />
            </Link>
            <ContextHistoryButton contextKey={context.key} contextTitle={context.title} />
          </div>
        ) : null}
      </section>

      {deepLinkError ? (
        <p className="type-caption rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-md)] py-[var(--space-sm)] text-center text-text-secondary" role="status">
          That track could not be found in your library.
        </p>
      ) : null}

      {sleep.expired ? (
        <p className="type-caption text-center text-text-secondary" role="status">
          Playback stopped because the sleep timer ended.
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
          <div className="flex flex-wrap items-center justify-center gap-[var(--space-sm)]">
            <TransportControls />
            <SpeedMenu />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-[var(--space-md)]">
          <PlaybackStatusLine />
          <TransportControls />
        </div>
      )}

      <section aria-label="More controls" className="flex flex-wrap items-center justify-center gap-[var(--space-sm)]">
        <button
          type="button"
          className="hidden h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:inline-flex"
          onClick={() => setJumpOpen(true)}
          disabled={current.isLive}
        >
          <Icon name="clock" size="sm" />
          Jump to time
        </button>
        <button
          type="button"
          className="hidden h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:inline-flex"
          onClick={() => setSleepOpen(true)}
        >
          <Icon name="sleep" size="sm" />
          {sleepLabel}
        </button>
        {!local ? (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            onClick={requestOpenNote}
          >
            <Icon name="note" size="sm" />
            Note
          </button>
        ) : null}
        <div className="hidden md:block">
          <VolumeControl withSlider />
        </div>
        <PlayerMoreMenu
          className="md:hidden"
          jumpDisabled={current.isLive}
          sleepLabel={sleepLabel}
          onJump={() => setJumpOpen(true)}
          onSleep={() => setSleepOpen(true)}
        />
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
          Space play/pause · ← → 5 seconds · Shift + ← → 30 seconds · ↑ ↓ volume · M mute · J / L 10 seconds</p>
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
    return "On your device";
  }
  return "Online";
}
