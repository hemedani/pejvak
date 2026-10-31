/**
 * An opened collection's items, grouped into the series they actually are.
 *
 * ## Why the grouping exists
 *
 * A manahej category is a *shelf*, not a course: «تاریخ شیعه» holds 57 episodes
 * that are really nine series, interleaved by publish date because the source's
 * playlist query includes descendants. Nine shows arrive shuffled into one list
 * and nothing marks where one ends. `buildSeriesSections` reads the series out
 * of the titles; this renders what it returns.
 *
 * ## Why it is conditional
 *
 * Grouping is only worth its headings when it separates something. A collection
 * with one series and no strays is the flat list with a heading on top, and a
 * collection of 25 book summaries is 22 headings of one episode each — worse
 * than the list it replaced. So sections are used only when there is **more than
 * one**, which is exactly when a heading tells the listener something the order
 * did not.
 *
 * A series is **not** a collection: it gets no route, no key and no progress of
 * its own. It is a way of reading one list (see `series.ts`).
 */

import { TrackRow } from "@/components/online/track-row";
import { Skeleton } from "@/components/ui/state";
import type { PlayableCollection } from "@/lib/online/play";
import { STANDALONE_TITLE, buildSeriesSections } from "@/lib/online/series";
import type { OnlineSource, OnlineSourceKind, OnlineTrack } from "@/lib/online/types";

/** The kinds whose episode titles carry a series name. */
const GROUPED_KINDS: ReadonlySet<OnlineSourceKind> = new Set(["manahej", "aminikhaah"]);

export function TrackList({
  source,
  collection,
  tracks,
}: {
  source: OnlineSource;
  collection: PlayableCollection;
  tracks: readonly OnlineTrack[];
}) {
  const sections = GROUPED_KINDS.has(source.kind) ? buildSeriesSections(tracks) : [];
  const grouped = sections.length > 1;

  if (!grouped) {
    return (
      <ul className="divide-y divide-outline-variant">
        {tracks.map((track) => (
          <TrackRow key={track.externalId} track={track} collection={collection} />
        ))}
      </ul>
    );
  }

  return (
    <div>
      {sections.map((section) => (
        <section key={section.key} className="border-b border-outline-variant last:border-b-0">
          <h3 className="type-label bg-surface-sunken px-[var(--space-lg)] py-[var(--space-sm)] text-text-secondary">
            {section.standalone ? STANDALONE_TITLE : section.title}
          </h3>
          <ul className="divide-y divide-outline-variant">
            {section.tracks.map((track) => (
              <TrackRow key={track.externalId} track={track} collection={collection} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Eight row-shaped placeholders, for a track list that is still loading. */
export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[var(--space-sm)] p-[var(--space-lg)]" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-[var(--space-md)]">
          <Skeleton className="size-11 shrink-0 rounded-[var(--radius-sm)]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-[var(--space-xs)] h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
