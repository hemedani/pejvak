"use client";

/**
 * The queue.
 *
 * Order is the thing being edited here, so each row is a handle: move it up or
 * down (logical, not physical — "up" is toward the start of the queue, which is
 * the top of the list), remove it, or make it current. The current row is
 * marked by both an accent bar and a word, not by colour alone.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { jumpTo, moveQueueItem, removeQueueItem } from "@/lib/player/controller";
import { isUnplayableHere } from "@/lib/player/queue";
import { formatCount } from "@/lib/format";
import { formatClock } from "@/lib/time";
import { usePlayerStore } from "@/stores/player";

import { Sheet } from "./sheet";

export function QueueSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const context = usePlayerStore((state) => state.context);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Playback queue"
      description={queue.length > 0 ? `${formatCount(queue.length, "track")}` : "The queue is empty."}
    >
      {queue.length === 0 ? (
        <div className="flex flex-col items-center gap-[var(--space-md)] py-[var(--space-xxl)] text-center">
          <p className="type-body text-text-secondary">The queue is empty.</p>
          {context ? (
            <Link
              href={context.type === "playlist" ? `/playlists/${context.key}` : "/browse"}
              className="type-label rounded-[var(--radius-sm)] px-[var(--space-md)] py-[var(--space-sm)] text-accent hover:bg-accent-soft"
            >
              Back to {context.title}
            </Link>
          ) : null}
        </div>
      ) : (
        <ol className="flex flex-col gap-[var(--space-xs)]">
          {queue.map((track, index) => {
            const current = index === queueIndex;
            const local = isUnplayableHere(track);
            const missing = track.title.trim() === "" || track.title === "Untitled";
            const first = index === 0;
            const last = index === queue.length - 1;

            return (
              <li
                key={`${track.contentHash}-${index}`}
                className={cn(
                  "flex items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] border px-[var(--space-sm)] py-[var(--space-xs)]",
                  current
                    ? "border-accent/40 bg-accent-soft"
                    : "border-transparent hover:bg-surface-sunken",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-8 w-[3px] shrink-0 rounded-[var(--radius-pill)]",
                    current ? "bg-accent" : "bg-transparent",
                  )}
                />
                <span className="type-numeric w-5 shrink-0 text-center text-text-tertiary">
                  {index + 1}
                </span>

                {local ? (
                  <div className="min-w-0 flex-1 py-[var(--space-xs)]">
                    <p className="type-label truncate text-text">
                      {missing ? "This track is no longer in your library" : track.title}
                    </p>
                    <p className="type-caption text-text-tertiary">
                      This track&rsquo;s audio is on your device and cannot be played on the web.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-[var(--radius-xs)] py-[var(--space-xs)] text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    aria-current={current ? "true" : undefined}
                    onClick={() => {
                      if (!current) {
                        void jumpTo(index);
                      }
                      onOpenChange(false);
                    }}
                  >
                    <p className="type-label truncate text-text">
                      {missing ? "This track is no longer in your library" : track.title}
                    </p>
                    <p className="type-caption truncate text-text-secondary">
                      {missing ? "No metadata" : (track.artist ?? "Unknown artist")}
                      {current ? " · Playing now" : ""}
                    </p>
                  </button>
                )}

                <span className="type-numeric shrink-0 text-text-tertiary">
                  {track.isLive ? "Live" : formatClock(track.durationSec)}
                </span>

                <div className="flex shrink-0 items-center">
                  <IconButton
                    label="Move up"
                    icon="up"
                    disabled={first}
                    onClick={() => moveQueueItem(index, index - 1)}
                  />
                  <IconButton
                    label="Move down"
                    icon="down"
                    disabled={last}
                    onClick={() => moveQueueItem(index, index + 1)}
                  />
                  <IconButton
                    label={current ? "Remove and play next" : "Remove from queue"}
                    icon="delete"
                    onClick={() => void removeQueueItem(index)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

function IconButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: "up" | "down" | "delete";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-text-tertiary hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size="sm" />
    </button>
  );
}
