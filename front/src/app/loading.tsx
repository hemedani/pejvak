import { Skeleton } from "@/components/ui/state";

/**
 * The route-level loading state for screens that do not declare their own.
 *
 * It draws a page header and one content block — the shape almost every screen
 * shares. The dashboard has its own loader beside its page (`(shell)/(home)`),
 * because a dashboard-shaped fallback shown while Settings loads is a promise
 * the next screen breaks: the skeleton must be the shape of what replaces it.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]" role="status" aria-label="Loading">
      <div className="flex flex-col gap-[var(--space-sm)]">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-[var(--measure-prose)]" />
      </div>

      <Skeleton className="h-64 rounded-[var(--radius-card)]" />
    </div>
  );
}
