/**
 * A page of history, drawn as days.
 *
 * ## One card per day, not one per listen
 *
 * A card is a surface, and forty elevated rows would be forty surfaces competing
 * for the same shadow. A day is a bounded group with a heading and a total, so it
 * earns the card; the rows inside it are a sequence, separated by an inset
 * hairline and nothing else (the web's card rule: a list is a sequence, not
 * forty floating cards).
 *
 * ## The day header is not sticky
 *
 * A sticky header earns its layer when the list is long and uniform. Here a
 * single listen can be the entire page, and a header pinned over one row is
 * chrome that never moves.
 *
 * ## The total says "this day", and the summary says "this page"
 *
 * Both are folds over what was loaded — the act returns no total, so neither
 * figure is a lifetime number and neither is labelled as one. Summing the
 * stretches, never the sessions: a stretch already sums its members, and adding
 * both would count the same minutes twice.
 */

import { HistoryRow } from "@/components/domain/history-row";
import { Card, CardHeading } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/state";
import { formatSpan } from "@/lib/format";
import type { HistorySection } from "@/lib/history";

export function HistorySections({ sections }: { sections: readonly HistorySection[] }) {
  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {sections.map((section) => (
        <Card key={section.key}>
          {/*
            Rendered only when there is a label. `HistorySection.title` is
            nullable for a flat list, and inventing a heading for that case would
            be a caption the data never asked for.
          */}
          {section.title ? (
            <CardHeading
              title={section.title}
              className="px-[var(--space-lg)] pt-[var(--space-lg)] pb-[var(--space-xs)]"
              action={
                <span className="type-numeric type-caption text-text-tertiary">
                  {formatSpan(section.listenedSec)}
                </span>
              }
            />
          ) : null}

          <ol className="flex flex-col">
            {section.data.map((stretch, index) => (
              // The first row of a day has the heading above it instead of a
              // hairline; every other row is separated from the one before.
              <HistoryRow key={stretch.id} stretch={stretch} divided={index > 0} />
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

/**
 * The shape of the list before it arrives.
 *
 * Row-shaped rather than a spinner: the page has a header, a filter and a
 * navigation bar around this area, and a spinner in the middle of them reads as
 * "the page broke" where a skeleton reads as "the rows are on their way". Eight
 * rows because that is roughly what one day of listening fills.
 */
export function HistorySkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card>
      <div className="px-[var(--space-lg)] pt-[var(--space-lg)] pb-[var(--space-xs)]">
        <Skeleton className="h-5 w-28" />
      </div>

      <div
        className="px-[var(--space-lg)]"
        role="status"
        aria-label="Loading"
      >
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-[var(--space-lg)] py-[var(--space-md)]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-xs)]">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}
