"use client";

/**
 * Playback speed.
 *
 * The trigger shows the current value, not the word "speed": a listener looking
 * for why the narrator is fast should not have to open a menu to find out.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatSpeed } from "@/lib/format";
import { setSpeed } from "@/lib/player/controller";
import { usePlayerStore } from "@/stores/player";

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export function SpeedMenu({ compact = false }: { compact?: boolean }) {
  const speed = usePlayerStore((state) => state.playbackSpeed);

  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-[var(--space-xs)] rounded-[var(--radius-sm)]",
            "text-text-secondary hover:bg-surface-sunken hover:text-text",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            compact ? "h-9 px-[var(--space-sm)] type-numeric" : "h-11 px-[var(--space-md)] type-label",
          )}
          aria-label={`سرعت پخش، ${formatSpeed(speed)}`}
        >
          <Icon name="speed" size="sm" />
          <span className="type-numeric">{formatSpeed(speed)}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-40 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-strong)] p-[var(--space-xs)] shadow-[var(--elevation-panel)] backdrop-blur-xl"
        >
          <DropdownMenu.Label className="type-overline px-[var(--space-sm)] py-[var(--space-xs)] text-text-tertiary">
            سرعت پخش
          </DropdownMenu.Label>
          {SPEEDS.map((rate) => {
            const active = Math.abs(rate - speed) < 0.001;
            return (
              <DropdownMenu.Item
                key={rate}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-[var(--radius-xs)] px-[var(--space-sm)] py-[var(--space-sm)]",
                  "type-label text-text outline-none data-[highlighted]:bg-accent-soft",
                )}
                onSelect={() => setSpeed(rate)}
              >
                <span className="type-numeric">{formatSpeed(rate)}</span>
                {active ? <Icon name="check" size="sm" className="text-accent" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
