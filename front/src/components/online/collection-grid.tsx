/**
 * The grid a shelf of collections is drawn in.
 *
 * Four columns at the widest, one at the narrowest, and the same height for
 * every card in a row — which is the title's `line-clamp-2` doing the work
 * rather than a fixed height that would clip a long Persian title.
 *
 * The skeletons live here rather than in `ui/state.tsx` because their shape is
 * this grid's, not a generic one: six tiles that are the same square-plus-two-
 * lines as a card. A skeleton with the wrong shape is a flash of a different
 * layout.
 */

import { Skeleton } from "@/components/ui/state";
import { cn } from "@/lib/cn";

export function CollectionGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Six card-shaped placeholders, for a grid that is still loading. */
export function CollectionGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-label="در حال بارگذاری"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-card)] border border-outline-variant bg-surface p-[var(--space-md)]"
        >
          <Skeleton className="aspect-square w-full rounded-[var(--radius-md)]" />
          <Skeleton className="mt-[var(--space-md)] h-3 w-1/3" />
          <Skeleton className="mt-[var(--space-sm)] h-4 w-full" />
          <Skeleton className="mt-[var(--space-xs)] h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
