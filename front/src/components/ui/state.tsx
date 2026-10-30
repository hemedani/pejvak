/**
 * The four states every data surface must render (plan §6.4).
 *
 * A blank list is a bug, not a state — so "empty", "error" and "offline" are
 * components here, not a `length === 0 ? null : …` scattered across pages. Each
 * one says what happened *and* offers the action that resolves it; a state with
 * no action is an apology, and an apology is not a design.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { failureMessage, isRetryable } from "@/lib/messages";
import type { ActFailure } from "@/lib/result";

/** A shimmering placeholder with the shape of the thing that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken",
        className,
      )}
    />
  );
}

/** A table-shaped skeleton: the header row, then N body rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" role="status" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: IconName;
  /** The action that fills the empty state. */
  action?: { label: string; href: string };
};

export function EmptyState({ title, description, icon = "empty", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-[var(--space-md)] px-[var(--space-xl)] py-[var(--space-giant)] text-center">
      <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-surface-sunken text-text-tertiary">
        <Icon name={icon} size="xl" />
      </span>
      <div className="max-w-[42ch]">
        <p className="type-body-strong text-text">{title}</p>
        <p className="type-caption text-text-tertiary mt-[var(--space-xs)]">{description}</p>
      </div>
      {action ? (
        <Button asChild variant="primary" size="md" className="mt-[var(--space-sm)]">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

type ErrorStateProps = {
  failure: ActFailure;
  /**
   * Where "try again" goes — the same route, so a navigation re-renders the
   * Server Component and re-issues the read.
   *
   * A link rather than a Server Action: a retry is a navigation, and a
   * `<form action={fn}>` would need an action reference threaded through every
   * caller to do the same thing.
   */
  retryHref?: string;
  className?: string;
};

/**
 * What a failed read looks like.
 *
 * The Persian sentence comes from `failureMessage`, never from the backend — a
 * raw English string in a Persian page reads as a crash (see `lib/messages.ts`).
 * The raw message is kept in a `<details>` so it is available to whoever is
 * debugging without being the thing the listener reads first.
 */
export function ErrorState({ failure, retryHref, className }: ErrorStateProps) {
  const offline = failure.kind === "offline";

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-[var(--space-md)] px-[var(--space-xl)] py-[var(--space-xxl)]",
        className,
      )}
      role="alert"
    >
      <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-danger-soft text-danger">
        <Icon name={offline ? "offline" : "error"} size="lg" />
      </span>

      <div>
        <p className="type-body-strong text-text">
          {offline ? "ارتباط برقرار نشد" : "این بخش بارگذاری نشد"}
        </p>
        <p className="type-caption text-text-tertiary mt-[var(--space-xs)]">
          {failureMessage(failure)}
        </p>
      </div>

      {retryHref && isRetryable(failure) ? (
        <Button asChild variant="secondary" size="md">
          <Link href={retryHref}>تلاش دوباره</Link>
        </Button>
      ) : null}

      {failure.message ? (
        <details className="type-caption text-text-tertiary">
          <summary className="cursor-pointer select-none">جزئیات فنی</summary>
          <p className="mt-[var(--space-xs)] break-all" dir="ltr">
            {failure.message}
          </p>
        </details>
      ) : null}
    </div>
  );
}

/**
 * The offline banner.
 *
 * A banner, never a blank page: the listener is told the connection is gone and
 * is left looking at what they already had.
 */
export function OfflineBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-[var(--space-sm)] rounded-[var(--radius-md)]",
        "bg-danger-soft px-[var(--space-lg)] py-[var(--space-md)] text-danger",
        className,
      )}
      role="status"
    >
      <Icon name="offline" size="sm" />
      <p className="type-caption">اتصال به سرور قطع است. اطلاعات نمایشدادهشده ممکن است قدیمی باشد.</p>
    </div>
  );
}
