"use client";

/**
 * The timeline.
 *
 * It renders the store and calls `seek`; it never stores progress. Position is
 * interpolated with `progressSmoothing.ts` between the engine's whole-second
 * reports, so the thumb moves at the speed of the voice rather than the speed of
 * `timeupdate`.
 *
 * Radial: the fill and the thumb work in reading direction, which in RTL means
 * starting at the right. The slider is told `dir="rtl"` explicitly.
 */

import * as Slider from "@radix-ui/react-slider";
import { useState } from "react";

import { formatClockFa } from "@/lib/format";
import { seek } from "@/lib/player/controller";
import { markerOffsetRatio } from "@/lib/player/annotations";
import { progressRatio } from "@/lib/player/progressSmoothing";
import { usePlayerStore } from "@/stores/player";

import { AnnotationMarkers, type TimelineMarker } from "./annotation-markers";
import { useSmoothedPosition } from "./use-player";

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
  const isLive = usePlayerStore((state) => state.current?.isLive === true);
  const resumeFromSec = usePlayerStore((state) => state.resumeFromSec);
  const [drag, setDrag] = useState<number | null>(null);

  if (isLive) {
    return (
      <div className="flex items-center gap-[var(--space-sm)]" data-player-surface>
        <span className="inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-pill)] bg-danger-soft px-[var(--space-sm)] py-[var(--space-xxs)] type-caption text-danger">
          <span aria-hidden className="size-2 rounded-full bg-danger" />
          زنده
        </span>
        <div aria-hidden className="h-[var(--bar-thin)] flex-1 rounded-[var(--radius-pill)] bg-track" />
      </div>
    );
  }

  const max = Math.max(1, durationSec);
  const value = Math.max(0, Math.min(durationSec || max, drag ?? position));
  const activeRatio = progressRatio(value, durationSec);
  const resumeRatio = resumeFromSec ? markerOffsetRatio(resumeFromSec, durationSec) : null;

  if (waiting) {
    return (
      <div className="relative" data-player-surface>
        <div
          className="relative h-[var(--bar-thick)] w-full overflow-hidden rounded-[var(--radius-pill)] bg-track"
          role="progressbar"
          aria-label="در حال بارگذاری"
          aria-valuetext="در حال بارگذاری"
        >
          <span className="absolute inset-y-0 -inset-x-1/3 animate-[player-sweep_1.4s_ease-in-out_infinite] bg-accent/45 motion-reduce:animate-none motion-reduce:bg-accent/30" />
        </div>
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          {formatClockFa(value)} / {formatClockFa(durationSec)}
        </p>
      </div>
    );
  }

  return (
    <div className="relative" data-player-surface>
      <div className="relative py-[var(--space-sm)]">
        <AnnotationMarkers
          markers={markers}
          durationSec={durationSec}
          onSelect={onSelectMarker}
        />

        {resumeRatio !== null ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-[var(--radius-pill)] bg-outline-strong"
            style={{ insetInlineStart: `${resumeRatio * 100}%` }}
          />
        ) : null}

        <Slider.Root
          dir="rtl"
          className="relative flex h-6 w-full touch-none select-none items-center"
          min={0}
          max={max}
          step={1}
          value={[value]}
          disabled={durationSec <= 0}
          aria-label="جای پخش"
          aria-valuetext={formatClockFa(value)}
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
          <Slider.Track className="relative h-[var(--bar-thick)] w-full grow overflow-hidden rounded-[var(--radius-pill)] bg-track">
            <Slider.Range className="absolute h-full bg-accent" />
          </Slider.Track>
          <Slider.Thumb
            className="block size-4 rounded-full border-2 border-surface bg-accent shadow-[var(--elevation-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="دستگیرهٔ جای پخش"
          />
        </Slider.Root>

        {drag !== null ? (
          <span
            className="pointer-events-none absolute -top-2 -translate-y-full translate-x-1/2 rounded-[var(--radius-sm)] bg-surface px-[var(--space-sm)] py-[var(--space-xxs)] type-numeric text-text shadow-[var(--elevation-card)]"
            style={{ insetInlineStart: `${activeRatio * 100}%` }}
          >
            {formatClockFa(drag)}
          </span>
        ) : null}
      </div>

      <div className="type-numeric flex justify-between text-text-tertiary">
        <span className="text-text-secondary">{formatClockFa(value)}</span>
        <span>{durationSec > 0 ? formatClockFa(Math.max(0, durationSec - value)) : "—"}</span>
      </div>
    </div>
  );
}
