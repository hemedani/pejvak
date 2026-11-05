/**
 * One playlist, as a card in the list.
 *
 * ## The whole card is the link
 *
 * There is nothing interactive inside it — rename and delete live on the detail
 * page, where the contents are visible — so one `<Link>` wrapping the surface is
 * the largest honest hit area. The "Open" affordance at the end edge is a
 * `<span>`, not a second anchor: an anchor inside an anchor is invalid, and two
 * links to one destination make a screen reader announce the card twice.
 *
 * ## What the card knows, and what it does not
 *
 * `playlist.items.length` is exact — the act returned the array — so the count
 * needs no second read. It is *not* the number of playable tracks: resolving
 * that would mean a library scan per card, and the card's job is "which one",
 * not "what is in it".
 */

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Playlist } from "@/lib/domain/playlist";
import { formatCount } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time";

export function PlaylistCard({ playlist, now }: { playlist: Playlist; now: number }) {
  // The time clause is dropped rather than printed as "Updated never": a row
  // with no timestamp is not "never changed", it is a row whose timestamp we do
  // not have, and the count alone is still true.
  const meta = [
    formatCount(playlist.items.length, "track"),
    playlist.updatedAt === null
      ? null
      : `Updated ${formatRelativeTime(playlist.updatedAt, now)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <Card className="flex items-start justify-between gap-[var(--space-lg)] p-[var(--space-lg)] transition-colors hover:bg-surface-sunken">
        <div className="min-w-0">
          <h2 dir="auto" className="type-heading truncate text-text">{playlist.title}</h2>

          {playlist.description ? (
            <p dir="auto" className="type-caption mt-[var(--space-xs)] line-clamp-1 text-text-tertiary">
              {playlist.description}
            </p>
          ) : null}

          <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">{meta}</p>
        </div>

        <span className="type-label inline-flex shrink-0 items-center gap-[var(--space-xs)] text-text-secondary">
          Open
          <Icon name="end" size="xs" />
        </span>
      </Card>
    </Link>
  );
}
