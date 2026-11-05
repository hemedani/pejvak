"use client";

/**
 * The player's narrow-viewport utility menu.
 *
 * On a phone the transport keeps the row to itself and the two time utilities
 * live behind one control; five labelled buttons wrapping onto three lines
 * pushed the annotations off the first screen. On a wide viewport the same
 * controls stay visible, because there is room to name them.
 *
 * The menu is a Radix dropdown, not a sheet: it is a short list of actions, and
 * a sheet would cover the very controls the listener is choosing between.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function PlayerMoreMenu({
  jumpDisabled,
  sleepLabel,
  onJump,
  onSleep,
  className,
}: {
  jumpDisabled: boolean;
  sleepLabel: string;
  onJump: () => void;
  onSleep: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu.Root dir="ltr">
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-11 items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] px-[var(--space-md)]",
            "type-label text-text-secondary hover:bg-surface-sunken hover:text-text",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            className,
          )}
          aria-label="More playback controls"
        >
          <Icon name="more" size="md" />
          More
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="center"
          className="z-50 min-w-44 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-strong)] p-[var(--space-xs)] shadow-[var(--elevation-panel)] backdrop-blur-xl"
        >
          <DropdownMenu.Item
            disabled={jumpDisabled}
            onSelect={onJump}
            className="flex cursor-pointer items-center gap-[var(--space-sm)] rounded-[var(--radius-xs)] px-[var(--space-sm)] py-[var(--space-sm)] type-label text-text outline-none data-[highlighted]:bg-accent-soft data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
          >
            <Icon name="clock" size="sm" />
            Jump to time
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={onSleep}
            className="flex cursor-pointer items-center gap-[var(--space-sm)] rounded-[var(--radius-xs)] px-[var(--space-sm)] py-[var(--space-sm)] type-label text-text outline-none data-[highlighted]:bg-accent-soft"
          >
            <Icon name="sleep" size="sm" />
            {sleepLabel}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
