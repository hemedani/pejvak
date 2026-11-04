/**
 * The ten loudest tracks.
 *
 * Every row here is a `contentHash` from `getMyStats` joined to a title from
 * `getMyTracks` (plan §2 C4). A hash with no matching track keeps its row and
 * says so, because the alternative — dropping it — hides listening time from the
 * one table whose job is to account for it.
 *
 * The hash is shown, truncated, only when the title is missing: it is not useful
 * information, it is the reason the row has no name.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { TopTrackRow } from "@/lib/insights";
import { formatNumber, formatSpan } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time";

export function TopTracksTable({ rows, now }: { rows: readonly TopTrackRow[]; now: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
      <table className="w-full border-collapse text-start">
        <caption className="sr-only">The ten tracks with the most listening time</caption>
        <thead>
          <tr className="border-b border-outline-variant">
            <Th className="w-10 text-center">#</Th>
            <Th>Title</Th>
            <Th className="hidden text-end sm:table-cell">Listening time</Th>
            <Th className="hidden text-end md:table-cell">Plays</Th>
            <Th className="hidden text-end lg:table-cell">Last played</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.contentHash}
              className="border-b border-outline-variant last:border-b-0 hover:bg-surface-sunken/60"
            >
              <td className="type-numeric py-[var(--space-md)] text-center text-text-tertiary">
                {index + 1}
              </td>

              <td className="py-[var(--space-md)] pe-[var(--space-md)]">
                <div className="flex min-w-0 items-center gap-[var(--space-sm)]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-2xs)] bg-surface-sunken text-text-tertiary">
                    <Icon name="player" size="sm" />
                  </span>

                  <div className="min-w-0">
                    {row.title && row.id ? (
                      <Link
                        href={`/library/${row.id}`}
                        dir="auto"
                        className="type-label block truncate text-text hover:underline"
                      >
                        {row.title}
                      </Link>
                    ) : row.title ? (
                      // A title with no id means the join found the row but the
                      // library page did not carry it this time. Rare, and the
                      // name is still worth showing without a link to nowhere.
                      <p className="type-label truncate text-text" dir="auto">
                        {row.title}
                      </p>
                    ) : (
                      <>
                        <p className="type-label truncate text-text-tertiary">
                          Not in your library
                        </p>
                        <p className="type-caption truncate text-text-tertiary" dir="ltr">
                          {row.contentHash.slice(0, 12)}…
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </td>

              <td className="type-numeric hidden py-[var(--space-md)] text-end text-text-secondary sm:table-cell">
                {formatSpan(row.listenTimeSec)}
              </td>

              <td className="type-numeric hidden py-[var(--space-md)] text-end text-text-secondary md:table-cell">
                {formatNumber(row.playCount)}
              </td>

              <td className="type-caption hidden py-[var(--space-md)] text-end text-text-tertiary lg:table-cell">
                {row.lastPlayedAt === null ? "—" : formatRelativeTime(row.lastPlayedAt, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`type-caption px-[var(--space-md)] py-[var(--space-sm)] font-semibold text-text-tertiary ${
        className ?? "text-start"
      }`}
    >
      {children}
    </th>
  );
}
