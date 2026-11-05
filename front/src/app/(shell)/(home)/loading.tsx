import { Skeleton } from "@/components/ui/state";

/**
 * The dashboard's loading state.
 *
 * It lives with the dashboard, not at the app root: a `loading.tsx` at the root
 * is the fallback for every route that does not declare its own, so a Settings
 * navigation would flash four stat cells and a chart before the form arrived.
 *
 * The shape is the point. Four totals, then the activity block — the page does
 * not jump when the reads land, which is what a spinner cannot promise.
 */
export default function HomeLoading() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]" role="status" aria-label="Loading">
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
