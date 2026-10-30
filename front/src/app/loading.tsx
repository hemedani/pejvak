import { Skeleton } from "@/components/ui/state";

/**
 * The route-level loading state.
 *
 * It draws the *shape* of a dashboard — four stat cells and a chart block —
 * rather than a centred spinner. A skeleton that matches the layout means the
 * page does not jump when the data lands, and a spinner means it does.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]" role="status" aria-label="در حال بارگذاری">
      <div className="flex flex-col gap-[var(--space-sm)]">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>

      <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-[var(--radius-card)]" />
        ))}
      </div>

      <Skeleton className="h-64 rounded-[var(--radius-card)]" />
    </div>
  );
}
