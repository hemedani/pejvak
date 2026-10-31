"use client";

/**
 * The sidebar's queue entry.
 *
 * It is deliberately a request, not the sheet: the sheet lives with the bar so
 * it is available on every shell page and there is only one of it.
 */

import { Icon } from "@/components/ui/icon";
import { fa } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";

import { requestOpenQueue } from "./queue-events";

export function SidebarQueueSlot() {
  const current = usePlayerStore((state) => state.current);
  const count = usePlayerStore((state) => state.queue.length);

  if (!current) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[var(--space-sm)] border-t border-outline-variant pt-[var(--space-lg)]">
      <p className="type-overline px-[var(--space-sm)] text-text-tertiary">پخش</p>
      <button
        type="button"
        className="flex h-11 items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] px-[var(--space-sm)] type-label text-text-secondary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        onClick={requestOpenQueue}
      >
        <Icon name="queue" size="md" />
        <span className="flex-1 text-start">صف پخش</span>
        {count > 0 ? (
          <span className="type-numeric rounded-[var(--radius-pill)] bg-surface px-[var(--space-sm)] py-[var(--space-xxs)] text-text-tertiary">
            {fa(count)}
          </span>
        ) : null}
      </button>
    </div>
  );
}
