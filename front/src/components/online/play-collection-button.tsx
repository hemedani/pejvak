"use client";

/**
 * The control that turns a shelf into sound.
 *
 * One component for three places, because they differ only in what they say and
 * where they start:
 *
 *   · the collection page — «پخش», with the whole collection already loaded;
 *   · a Continue card — «ادامه», which resumes at a stored index and position
 *     and has no tracks of its own (it asks the source on click);
 *   · a row inside the track list — «پخش از این قطعه», which starts at that row
 *     but still queues the **whole** collection, so the run's `trackCount` is
 *     the collection rather than one episode.
 *
 * Three rules it exists to keep:
 *
 *   · **No navigation.** The player bar appears and the listener stays where
 *     they are; a click that also navigates loses their place in a long list.
 *   · **One queue per click.** Resolving a source and hashing sixty identities
 *     takes a moment, and a double click during that moment would start two
 *     queues — the second one winning with the same content, which looks like
 *     the first one silently restarting.
 *   · **Failure is shown, never thrown.** A source that is down gets its own
 *     Persian sentence under the button and a retry, not an `alert()` and not a
 *     broken page.
 */

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { playOnlineCollection, type PlayableCollection } from "@/lib/online/play";
import type { OnlineTrack } from "@/lib/online/types";

export function PlayCollectionButton({
  collection,
  tracks,
  index = 0,
  startPositionSec = 0,
  label,
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
}: {
  collection: PlayableCollection;
  tracks?: readonly OnlineTrack[];
  index?: number;
  startPositionSec?: number;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  /** Draw the glyph alone; `label` becomes the accessible name. */
  iconOnly?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not the state above: two clicks in the same tick both read `false`
  // from a state that has not re-rendered yet.
  const busy = useRef(false);

  async function start() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);

    try {
      const result = await playOnlineCollection({ collection, tracks, index, startPositionSec });
      if (!result.ok) {
        setError(result.message);
      }
    } catch {
      setError("پخش آغاز نشد. دوباره تلاش کنید.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-[var(--space-xs)]", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => void start()}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        {pending ? (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          <Icon name="play" size={iconOnly ? "md" : "sm"} />
        )}
        {iconOnly ? null : label}
      </Button>

      {error ? (
        <p className="type-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
