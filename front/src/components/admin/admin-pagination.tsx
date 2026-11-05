/**
 * Pagination for a list the backend *can* count.
 *
 * The listener lists return a bare array, so they can only offer a previous/next
 * pair (see `components/ui/pagination.tsx`). Admin list acts return a total, so
 * this control can say how many pages there are without inventing one. It is
 * still navigation: the page is in the URL and the server renders the rows.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { pageCount } from "@/lib/admin/domain/common";
import { cn } from "@/lib/cn";

export function AdminPagination({
  page,
  total,
  limit,
  buildHref,
  className,
}: {
  page: number;
  total: number;
  limit: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const pages = pageCount(total, limit);
  const hasPrevious = page > 1;
  const hasNext = page < pages;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-[var(--space-md)]", className)}
    >
      <PageLink href={buildHref(page - 1)} disabled={!hasPrevious} direction="previous">
        Previous
      </PageLink>

      <p className="type-numeric text-text-tertiary">
        Page {page} of {pages} · {total} {total === 1 ? "row" : "rows"}
      </p>

      <PageLink href={buildHref(page + 1)} disabled={!hasNext} direction="next">
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
    "inline-flex h-10 items-center gap-[var(--space-xs)] rounded-[var(--radius-md)] border border-outline-strong px-[var(--space-md)] type-label transition-colors duration-[var(--motion-fast)] coarse:h-[var(--tap-min)]";

  if (disabled) {
    return (
      <span aria-disabled className={`${base} cursor-not-allowed text-text-tertiary opacity-40`}>
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
