"use client";

/**
 * Volume.
 *
 * In the bar this is only the mute toggle — a slider that is 44 px wide is a
 * decoration, not a control. The full player gives it the room to be a slider.
 * The slider writes the engine's volume directly; the engine's `volumechange`
 * event writes it back to the store, so there is one value.
 */

import * as Slider from "@radix-ui/react-slider";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { setVolume, toggleMute } from "@/lib/player/controller";
import { usePlayerStore } from "@/stores/player";

export function VolumeControl({ withSlider = false }: { withSlider?: boolean }) {
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const audible = muted ? 0 : volume;

  return (
    <div className="flex items-center gap-[var(--space-sm)]">
      <button
        type="button"
        className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label={muted ? "وصل صدا" : "بی‌صدا"}
        aria-pressed={muted}
        aria-keyshortcuts="M"
        onClick={toggleMute}
      >
        <Icon name={muted || volume === 0 ? "mute" : "volume"} size="md" />
      </button>

      {withSlider ? (
        <Slider.Root
          dir="rtl"
          className="flex h-6 w-32 touch-none select-none items-center"
          min={0}
          max={1}
          step={0.01}
          value={[audible]}
          aria-label="بلندی صدا"
          aria-valuetext={formatPercent(audible)}
          onValueChange={(values) => {
            const next = values[0];
            if (typeof next === "number") {
              setVolume(next);
            }
          }}
        >
          <Slider.Track className="relative h-[var(--bar-thin)] w-full grow overflow-hidden rounded-[var(--radius-pill)] bg-track">
            <Slider.Range className={cn("absolute h-full", audible === 0 ? "bg-outline-strong" : "bg-accent")} />
          </Slider.Track>
          <Slider.Thumb
            className="block size-4 rounded-full border-2 border-surface bg-accent shadow-[var(--elevation-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="دستگیرهٔ بلندی صدا"
          />
        </Slider.Root>
      ) : null}
    </div>
  );
}
