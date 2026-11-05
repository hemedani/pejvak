"use client";

/**
 * Every play-through of one collection, newest first.
 *
 * The collection page can answer "where am I now" from the newest run it already
 * reads; this sheet answers the question that follows — "have I been here
 * before, and how did it go?". It is the web's answer to the phone's
 * `ContextHistorySheet`.
 *
 * ## It fetches when opened, not with the page
 *
 * The collection page does not need the older runs to render, and the player
 * knows only the run it is currently playing. Asking on open keeps both surfaces
 * instant and gives the act one call site. The runs are cached for the life of
 * the sheet, so reopening it is free; "Try again" is the one refetch.
 *
 * ## The act's order is the order
 *
 * `getMyPlaybackContexts` returns newest-first. Re-sorting here would make the
 * sheet disagree with the Continue shelf about what "recent" means.
 *
 * ## An open run is "In progress"
 *
 * `describeRunOutcome` describes a finished run's figures; a run with no
 * `endedAt` is not an outcome yet, and printing "Left early" for the playhead
 * still moving would be wrong.
 */

import { useState, useTransition } from "react";

import { getMyContexts } from "@/app/actions/online/get-my-contexts";
import { Sheet } from "@/components/player/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/state";
import { formatSpan } from "@/lib/format";
import { failureMessage } from "@/lib/messages";
import type { PlaybackContextRow } from "@/lib/online/types";
import { describeRunOutcome, describeRunScope } from "@/lib/player/playbackContext";
import type { ActFailure } from "@/lib/result";
import { formatDateTime } from "@/lib/time";

const HISTORY_LIMIT = 24;

export function ContextHistoryButton({
  contextKey,
  contextTitle,
}: {
  contextKey: string;
  contextTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<PlaybackContextRow[] | null>(null);
  const [failure, setFailure] = useState<ActFailure | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setFailure(null);
    startTransition(async () => {
      const result = await getMyContexts({ contextKey, limit: HISTORY_LIMIT });
      if (result.success) {
        setRuns(result.body);
      } else {
        setFailure(result.error);
      }
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && runs === null && !pending) {
      load();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(true)}
        aria-label={`Play-through history for ${contextTitle}`}
        title="Play-through history"
      >
        <Icon name="history" size="sm" />
        History
      </Button>

      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={contextTitle}
        description="Every play-through of this collection, newest first."
      >
        {failure ? (
          <div className="flex flex-col items-start gap-[var(--space-sm)]" role="alert">
            <p className="type-body-strong text-text">This history could not load</p>
            <p className="type-caption text-text-tertiary">{failureMessage(failure)}</p>
            <Button type="button" variant="secondary" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        ) : runs === null ? (
          <HistorySkeleton />
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-start gap-[var(--space-xs)]">
            <p className="type-body-strong text-text">No play-throughs yet</p>
            <p className="type-caption text-text-tertiary">
              Start this collection and each run will be recorded here.
            </p>
          </div>
        ) : (
          <ContextHistoryList runs={runs} />
        )}
      </Sheet>
    </>
  );
}

export function ContextHistoryList({ runs }: { runs: readonly PlaybackContextRow[] }) {
  return (
    <ol className="flex flex-col divide-y divide-outline-variant">
      {runs.map((run) => {
        const outcome =
          run.endedAt === null ? { label: "In progress" } : describeRunOutcome(run);
        return (
          <li
            key={run.clientId}
            className="flex items-baseline justify-between gap-[var(--space-lg)] py-[var(--space-md)]"
          >
            <div className="min-w-0">
              <p className="type-label text-text">{outcome.label}</p>
              <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
                {formatDateTime(run.startedAt)}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="type-numeric text-text-secondary">{formatSpan(run.listenedSec)}</p>
              <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
                {describeRunScope(run)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-[var(--space-md)]" role="status" aria-label="Loading">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-[var(--space-lg)]">
          <div className="flex flex-col gap-[var(--space-xs)]">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col items-end gap-[var(--space-xs)]">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
