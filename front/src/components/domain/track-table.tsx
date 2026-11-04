/**
 * The library list.
 *
 * Two renderings of one row set: a table where there is width, a stack of cards
 * where there is not. Both read from the same array, so a column added to one is
 * a column missing from the other — which is why the row is built once as
 * `TrackRowData` and only its *layout* differs.
 *
 * Sorting is a set of **links**, not click handlers. The order lives in the URL
 * and the backend does the sorting (`getMyTracks` takes `sortBy`/`sortOrder`), so
 * a sorted list is a page that can be reloaded, shared, and rendered correctly on
 * the server.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { OriginBadge } from "@/components/domain/origin-badge";
import type { TrackSummary } from "@/lib/domain/track";
import { cn } from "@/lib/cn";
import { formatSpan } from "@/lib/format";
import { highlight } from "@/lib/search";
import { formatDateTime, formatRelativeTime } from "@/lib/time";
import type { TrackSortField } from "@/lib/domain/track-query";

export type SortState = { field: TrackSortField; order: "asc" | "desc" };

type TrackRowProps = {
  tracks: readonly TrackSummary[];
  sort: SortState;
  /** The href that would sort by `field`, toggling order when it is already active. */
  buildSortHref: (field: TrackSortField) => string;
  now: number;
  /**
   * Highlight ranges per track id, from `searchIndex`.
   *
   * These are indices into the **original** title, which is why `fold()` keeps a
   * map back to the unfolded string (see `lib/search.ts`). Re-deriving them here
   * would mean folding a second time with a second implementation.
   */
  matches?: ReadonlyMap<string, readonly { start: number; end: number }[]>;
};

export function TrackTable({ tracks, sort, buildSortHref, now, matches }: TrackRowProps) {
  return (
    <>
      {/* Table: md and up. */}
      <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)] md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">Your library</caption>
          <thead>
            <tr className="border-b border-outline-variant">
              <SortHeader field="title" label="Title" sort={sort} buildHref={buildSortHref} />
              <SortHeader
                field="lastPlayedAt"
                label="Last played"
                sort={sort}
                buildHref={buildSortHref}
                className="hidden lg:table-cell"
              />
              <th scope="col" className="type-caption px-[var(--space-md)] py-[var(--space-sm)] text-end font-semibold text-text-tertiary">
                Listening time
              </th>
              <SortHeader
                field="createdAt"
                label="Added"
                sort={sort}
                buildHref={buildSortHref}
                className="hidden xl:table-cell"
              />
            </tr>
          </thead>

          <tbody>
            {tracks.map((track, index) => (
              <tr
                key={track.id}
                className="reveal-row border-b border-outline-variant last:border-b-0 hover:bg-surface-sunken/60"
                style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
              >
                <td className="py-[var(--space-md)] pe-[var(--space-md)] ps-[var(--space-md)]">
                  <TitleCell track={track} matches={matches} />
                </td>

                <td className="type-caption hidden py-[var(--space-md)] px-[var(--space-md)] text-text-tertiary lg:table-cell">
                  {track.lastPlayedAt === null ? "—" : formatRelativeTime(track.lastPlayedAt, now)}
                </td>

                <td className="type-numeric py-[var(--space-md)] px-[var(--space-md)] text-end text-text-secondary">
                  {track.totalListenTimeSec === 0 ? (
                    <span className="text-text-tertiary">—</span>
                  ) : (
                    formatSpan(track.totalListenTimeSec)
                  )}
                </td>

                <td
                  className="type-caption hidden py-[var(--space-md)] px-[var(--space-md)] text-text-tertiary xl:table-cell"
                  title={track.createdAt === null ? undefined : formatDateTime(track.createdAt)}
                >
                  {track.createdAt === null ? "—" : formatRelativeTime(track.createdAt, now)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards: below md. Same data, stacked. */}
      <ul className="flex flex-col gap-[var(--space-sm)] md:hidden">
        {tracks.map((track, index) => (
          <li
            key={track.id}
            className="reveal-row rounded-[var(--radius-lg)] border border-outline-variant bg-surface p-[var(--space-md)]"
            style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
          >
            <TitleCell track={track} matches={matches} />
            <div className="mt-[var(--space-sm)] flex items-center justify-between gap-[var(--space-sm)]">
              <span className="type-numeric text-text-secondary">
                {track.totalListenTimeSec === 0 ? "Not listened" : formatSpan(track.totalListenTimeSec)}
              </span>
              <span className="type-caption text-text-tertiary">
                {track.lastPlayedAt === null ? "—" : formatRelativeTime(track.lastPlayedAt, now)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function TitleCell({
  track,
  matches,
}: {
  track: TrackSummary;
  matches?: TrackRowProps["matches"];
}) {
  const subtitle = [track.author, track.narrator].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-[var(--space-md)]">
      <Artwork track={track} />

      <div className="min-w-0">
        {/* The title is the link, not the row: a whole-row click target makes
            text selection impossible and reads as a button to a screen reader.
            `block` is needed for `truncate` to apply to an anchor. */}
        <Link
          href={`/library/${track.id}`}
          title={track.title}
          className="type-label block truncate text-text hover:underline"
        >
          <Highlighted text={track.title} ranges={matches?.get(track.id)} />
        </Link>

        <div className="mt-[var(--space-xs)] flex flex-wrap items-center gap-[var(--space-xs)]">
          {subtitle ? (
            <span className="type-caption truncate text-text-tertiary">{subtitle}</span>
          ) : null}

          <OriginBadge origin={track.origin} />

          {track.collectionTitle ? (
            <span className="type-caption truncate text-text-tertiary">
              · {track.collectionTitle}
            </span>
          ) : null}
        </div>

        {/* §9.6: a local track is not an error and not a disabled button — it is a
            fact about where the audio is. Stated, not apologised for. */}
        {track.origin === "local" ? (
          <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">Audio is on your device</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The title with the matched runs marked.
 *
 * `highlight()` is the ported splitter; the marks are `<mark>` because that is
 * what the element means — assistive technology announces it, and the default
 * browser style is already a highlight rather than something to invent.
 */
function Highlighted({
  text,
  ranges,
}: {
  text: string;
  ranges?: readonly { start: number; end: number }[];
}) {
  if (!ranges || ranges.length === 0) {
    return <>{text}</>;
  }

  return (
    <>
      {highlight(text, ranges).map((segment, index) =>
        segment.matched ? (
          <mark
            key={index}
            className="rounded-[var(--radius-2xs)] bg-accent-soft px-[var(--space-xxs)] text-text"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function Artwork({ track }: { track: TrackSummary }) {
  if (track.artworkUrl) {
    return (
      // A remote URL from an arbitrary host: `next/image` would need every source
      // allow-listed at build time, and a broken image must not break the row.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={track.artworkUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]",
        "bg-surface-sunken text-text-tertiary",
      )}
    >
      <Icon name={track.isAudiobook ? "book" : "player"} size="md" />
    </span>
  );
}

function SortHeader({
  field,
  label,
  sort,
  buildHref,
  className,
}: {
  field: TrackSortField;
  label: string;
  sort: SortState;
  buildHref: (field: TrackSortField) => string;
  className?: string;
}) {
  const active = sort.field === field;

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-[var(--space-md)] py-[var(--space-sm)] text-start", className)}
    >
      <Link
        href={buildHref(field)}
        className={cn(
          "type-caption inline-flex items-center gap-[var(--space-xs)] font-semibold",
          active ? "text-text" : "text-text-tertiary hover:text-text",
        )}
      >
        {label}
        <span aria-hidden className={cn("type-overline", !active && "opacity-0")}>
          {sort.order === "asc" ? "▲" : "▼"}
        </span>
      </Link>
    </th>
  );
}
