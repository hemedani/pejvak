"use client";

/**
 * The timeline.
 *
 * It renders the store and calls `seek`; it never stores progress. Position is
 * interpolated with `progressSmoothing.ts` between the engine's whole-second
 * reports, so the thumb moves at the speed of the voice rather than the speed of
 * `timeupdate`.
 *
 * ## The wave is the bar
 *
 * The played segment is drawn by `WavyProgress` — a sine stroke that travels
 * while audio is playing and flattens under the finger — and the unplayed segment
 * is its flat, lower-contrast continuation. Radix still owns the *interaction*:
 * it is what gives the control a `role="slider"`, a keyboard model, pointer
 * capture and an accessible value. Only its visuals are switched off, which is
 * the whole trick — a hand-rolled drag handler would have cost all of that.
 *
 * The wave is the app's word for "audio is moving", so the waiting state says the
 * same thing with the same alphabet: a band travels across the bar, and the thumb
 * steps aside because a thumb parked at 0:00 on a stream that has not arrived
 * claims a position nobody has reached.
 *
 * The fill and the thumb work in reading direction, which is left to right. The
 * slider is told `dir="ltr"` explicitly rather than relying on the document's
 * direction, so a slider embedded in RTL text still fills from the left.
 */

import * as Slider from "@radix-ui/react-slider";
import { useState } from "react";

import { formatClock } from "@/lib/time";
import { seek } from "@/lib/player/controller";
import { markerOffsetRatio } from "@/lib/player/annotations";
import { progressRatio } from "@/lib/player/progressSmoothing";
import { usePlayerStore } from "@/stores/player";

import { AnnotationMarkers, type TimelineMarker } from "./annotation-markers";
import { useSmoothedPosition } from "./use-player";
import { WavyProgress } from "./wavy-progress";

/** Half the thumb's diameter: how far the playhead is clamped from either end. */
const THUMB_RADIUS = 9;
/** Visible space between the thumb's edge and either segment. */
const THUMB_GAP = 3;
/** The wave's reserved height, so the amplitude cannot make the row jump. */
const BAND_HEIGHT = 18;

export function Scrubber({
  markers,
  onSelectMarker,
}: {
  markers: readonly TimelineMarker[];
  onSelectMarker: (marker: TimelineMarker) => void;
}) {
  const position = useSmoothedPosition();
  const durationSec = usePlayerStore((state) => state.durationSec);
  const waiting = usePlayerStore((state) => state.waiting !== null);
  const playing = usePlayerStore((state) => state.status === "playing");
  const isLive = usePlayerStore((state) => state.current?.isLive === true);
  const resumeFromSec = usePlayerStore((state) => state.resumeFromSec);
  const [drag, setDrag] = useState<number | null>(null);

  if (isLive) {
    return (
      <div className="flex items-center gap-[var(--space-sm)]" data-player-surface>
        <span className="inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-pill)] bg-danger-soft px-[var(--space-sm)] py-[var(--space-xxs)] type-caption text-danger">
          <span aria-hidden className="size-2 rounded-full bg-danger" />
          Live
        </span>
        <div aria-hidden className="h-[var(--bar-thin)] flex-1 rounded-[var(--radius-pill)] bg-track" />
      </div>
    );
  }

  const max = Math.max(1, durationSec);
  const value = Math.max(0, Math.min(durationSec || max, drag ?? position));
  const activeRatio = progressRatio(value, durationSec);
  const resumeRatio = resumeFromSec ? markerOffsetRatio(resumeFromSec, durationSec) : null;
  const scrubbing = drag !== null;

  return (
    <div className="relative" data-player-surface>
      <div className="relative py-[var(--space-sm)]">
        {/*
          Markers and the resume pin sit above the wave so the played segment
          cannot swallow them, and so both keep their own press handling.
        */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {resumeRatio !== null ? (
            <span
              aria-hidden
              className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-pill)] bg-outline-strong"
              style={{ insetInlineStart: `${resumeRatio * 100}%` }}
            />
          ) : null}
          {waiting ? null : (
            <AnnotationMarkers
              markers={markers}
              durationSec={durationSec}
              onSelect={onSelectMarker}
            />
          )}
        </div>

        <Slider.Root
          dir="ltr"
          className="relative flex h-9 w-full touch-none select-none items-center coarse:h-[var(--tap-min)]"
          min={0}
          max={max}
          step={1}
          value={[value]}
          disabled={durationSec <= 0}
          aria-label="Playback position"
          aria-valuetext={formatClock(value)}
          onValueChange={(values) => {
            const next = values[0];
            if (typeof next === "number") {
              setDrag(next);
            }
          }}
          onValueCommit={(values) => {
            const next = values[0];
            setDrag(null);
            if (typeof next === "number") {
              seek(next);
            }
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 30 : 5;
            switch (event.key) {
              case "ArrowRight":
                event.preventDefault();
                seek(value + step);
                break;
              case "ArrowLeft":
                event.preventDefault();
                seek(value - step);
                break;
              case "PageUp":
                event.preventDefault();
                seek(value + 60);
                break;
              case "PageDown":
                event.preventDefault();
                seek(value - 60);
                break;
              case "Home":
                event.preventDefault();
                seek(0);
                break;
              case "End":
                event.preventDefault();
                seek(Math.max(0, durationSec - 1));
                break;
              default:
                break;
            }
          }}
        >
          <WavyProgress
            className="absolute inset-x-0 top-1/2 -translate-y-1/2"
            progress={activeRatio}
            isPlaying={playing}
            sweeping={waiting}
            scrubbing={scrubbing}
            tint="var(--accent)"
            trackColor="var(--track)"
            thickness={6}
            amplitude={3}
            wavelength={36}
            bandHeight={BAND_HEIGHT}
            inset={0}
            gap={THUMB_RADIUS + THUMB_GAP}
          />

          {/* Radix keeps the layout and the hit target; the paint is the wave. */}
          <Slider.Track className="relative h-[var(--bar-thick)] w-full grow rounded-[var(--radius-pill)] bg-transparent">
            <Slider.Range className="absolute h-full bg-transparent" />
          </Slider.Track>
          <Slider.Thumb
            className={
              waiting
                ? // Hidden rather than parked: while the player is waiting there
                  // is no position to point at, and a thumb at the left end reads
                  // as "paused at the start" instead of "not known yet".
                  "block size-[18px] opacity-0"
                : "block size-[18px] rounded-full border-[3px] border-accent bg-surface shadow-[var(--elevation-card)] transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            }
            aria-label="Playback position handle"
          />
        </Slider.Root>

        {/*
          The bubble is clamped to the bar's own width rather than to the thumb's
          travel: at 0:00 a centred bubble would hang half outside the row, which
          is the one place a floating label looks like a bug.
        */}
        {scrubbing ? (
          <span
            className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full rounded-[var(--radius-sm)] bg-surface px-[var(--space-sm)] py-[var(--space-xxs)] type-numeric text-text shadow-[var(--elevation-card)]"
            style={{
              insetInlineStart: `clamp(2rem, ${activeRatio * 100}%, calc(100% - 2rem))`,
            }}
          >
            {formatClock(drag)}
          </span>
        ) : null}
      </div>

      <div className="type-numeric flex justify-between text-text-tertiary">
        <span className="text-text-secondary">{formatClock(value)}</span>
        <span>{durationSec > 0 ? formatClock(Math.max(0, durationSec - value)) : "—"}</span>
      </div>
    </div>
  );
}
