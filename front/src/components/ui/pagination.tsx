/**
 * Page controls for a list the backend cannot count.
 *
 * There is no `total`, so there is no "page 3 of 12" (see
 * `actions/tracks/get-my-tracks.ts`). What exists is `hasMore`, and this renders
 * exactly that: a previous link that is absent on page one, and a next link that
 * is absent when the last page came back short. It never invents a page number
 * it cannot verify.
 *
 * Links, not buttons — pagination is navigation, so it belongs in the URL: the
 * back button works, a page can be shared, and the server renders the right rows
 * on first paint.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function Pagination({
  page,
  hasMore,
  buildHref,
  className,
}: {
  page: number;
  hasMore: boolean;
  /** Builds the href for a page number, preserving every other query param. */
  buildHref: (page: number) => string;
  className?: string;
}) {
  const hasPrevious = page > 1;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-[var(--space-md)]", className)}
    >
      <PageLink href={buildHref(page - 1)} disabled={!hasPrevious} direction="previous">
        Previous
      </PageLink>

      <p className="type-numeric text-text-tertiary">Page {page}</p>

      <PageLink href={buildHref(page + 1)} disabled={!hasMore} direction="next">
        Next
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  direction,
  children,
}: {
  href: string;
  disabled: boolean;
  direction: "previous" | "next";
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-[var(--control-md)] items-center gap-[var(--space-xs)] rounded-[var(--radius-md)] border border-outline-strong px-[var(--space-md)] type-label transition-colors duration-[var(--motion-fast)]";

  if (disabled) {
    // Rendered as a disabled control rather than removed: a control that appears
    // and disappears moves everything beside it, and the row would jump on every
    // page change.
    return (
      <span aria-disabled className={`${base} cursor-not-allowed opacity-40 text-text-tertiary`}>
        {direction === "previous" ? <Icon name="start" size="sm" /> : null}
        {children}
        {direction === "next" ? <Icon name="end" size="sm" /> : null}
      </span>
    );
  }

  return (
    <Link href={href} className={`${base} text-text hover:bg-surface-sunken`}>
      {direction === "previous" ? <Icon name="start" size="sm" /> : null}
      {children}
      {direction === "next" ? <Icon name="end" size="sm" /> : null}
    </Link>
  );
}

/**
 * "Older" for a list that pages by a cursor rather than a page number.
 *
 * History's cursor is a count of rows consumed (`after`), which is not a page
 * index and cannot be rendered as "Page 3" — there is no third page, only "the
 * next hundred rows past where you stopped". So this is one link in one
 * direction, and the URL is still the state: Back returns to the previous page,
 * and the link carries the active date range as well as the cursor.
 *
 * A disabled control is drawn rather than nothing at all, for the same reason
 * `Pagination` keeps its disabled ends: the row must not change height when the
 * last page is reached.
 */
export function CursorPagination({
  href,
  hasMore,
  label = "Older",
  className,
}: {
  href: string;
  hasMore: boolean;
  label?: string;
  className?: string;
}) {
  const base =
    "inline-flex h-[var(--control-md)] items-center gap-[var(--space-xs)] rounded-[var(--radius-md)] border border-outline-strong px-[var(--space-md)] type-label transition-colors duration-[var(--motion-fast)]";

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center", className)}>
      {hasMore ? (
        <Link href={href} className={`${base} text-text hover:bg-surface-sunken`}>
          {label}
          <Icon name="end" size="sm" />
        </Link>
      ) : (
        <span aria-disabled className={`${base} cursor-not-allowed text-text-tertiary opacity-40`}>
          {label}
          <Icon name="end" size="sm" />
        </span>
      )}
    </nav>
  );
}
