/**
 * One collection: a show, an album or a course, as a shelf card.
 *
 * Shared by the source's own listing, Favorites and Continue, because the four
 * answer the same question — "what is this, and where am I in it?" — and four
 * cards would eventually disagree about how to draw it. What differs between
 * them is the middle line and the trailing control, so both are props.
 *
 * Two rules the card exists to enforce:
 *
 *   · **A size that is not known prints nothing.** The archive's search index
 *     has no per-item track count and aminikhaah's catalogue omits it, so a
 *     listing reports `0`. Rendering that as "0 tracks" would label a thirty-part
 *     course as empty — `describeCollectionLine` already answers `null`, and the
 *     card draws no line at all rather than an empty one.
 *   · **The card is one link, and its controls are not inside it.** A play or
 *     favourite button nested in an anchor cannot be reached by keyboard as a
 *     separate control, and a tap on it navigates instead of acting. The action
 *     therefore sits *below* the link, in its own row.
 *
 * There is no download state and no download badge: the web has no filesystem,
 * and a control that promises something the product cannot keep is worse than
 * its absence.
 */

import Link from "next/link";

import { OnlineArtwork } from "@/components/online/artwork";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { describeCollectionLine, findSource } from "@/lib/online/catalogue";
import type { OnlineCollection } from "@/lib/online/types";
import { describeRunOutcome, runProgressRatio, type RunShape } from "@/lib/player/playbackContext";

export function CollectionCard({
  collection,
  href,
  run,
  action,
  className,
}: {
  collection: OnlineCollection;
  href: string;
  /** Continue cards: the run's figures, drawn as a caption and a progress bar. */
  run?: RunShape;
  /** The trailing control — rendered under the body, never inside the link. */
  action?: React.ReactNode;
  className?: string;
}) {
  const sourceName = findSource(collection.sourceId)?.nativeName ?? collection.sourceId;
  const line = describeCollectionLine(collection);
  const outcome = run ? describeRunOutcome(run) : null;
  const ratio = run ? runProgressRatio(run.finishedCount, run.trackCount) : 0;

  return (
    <Card
      className={cn(
        "flex h-full flex-col p-[var(--space-md)] transition-shadow duration-150 hover:shadow-[var(--elevation-panel)]",
        className,
      )}
    >
      <Link
        href={href}
        aria-label={collection.title}
        className="flex min-w-0 flex-1 flex-col gap-[var(--space-md)] rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <OnlineArtwork
          artworkUrl={collection.artworkUrl}
          title={collection.title}
          paletteKey={collection.key}
          className="aspect-square w-full"
        />

        <div className="min-w-0">
          <p dir="auto" className="type-kicker truncate text-text-tertiary">{sourceName}</p>
          <p
            dir="auto"
            className="type-body-strong mt-[var(--space-xxs)] line-clamp-2 text-text"
            title={collection.title}
          >
            {collection.title}
          </p>
          {line ? (
            <p className="type-caption mt-[var(--space-xs)] truncate text-text-tertiary">{line}</p>
          ) : null}
          {outcome ? (
            <p className="type-caption mt-[var(--space-xxs)] truncate text-text-secondary">
              {outcome.label}
            </p>
          ) : null}
        </div>
      </Link>

      {run ? (
        // A progress bar, not a percentage: "how far in" is a position on a
        // shelf, and the number beside it would compete with the title.
        <div
          aria-hidden
          className="mt-[var(--space-sm)] h-[var(--bar-thin)] w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--track)]"
        >
          <div
            className="h-full rounded-[var(--radius-pill)] bg-accent"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}

      {action ? <div className="mt-[var(--space-sm)]">{action}</div> : null}
    </Card>
  );
}
