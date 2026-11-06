/**
 * The four states every data surface must render (plan §6.4).
 *
 * A blank list is a bug, not a state — so "empty", "error" and "offline" are
 * components here, not a `length === 0 ? null : …` scattered across pages. Each
 * one says what happened *and* offers the action that resolves it; a state with
 * no action is an apology, and an apology is not a design.
 *
 * ## Why there is also a wrapper
 *
 * Having four good components does not make a page render four states — it makes
 * four *possible* states, and the one that ships is whichever the page happened
 * to write. `StateWrapper` closes that gap: the surface computes a
 * `SurfaceState` and the wrapper renders exactly one of them, so "I forgot the
 * error case" becomes a type error rather than a blank div someone finds in
 * production. `surfaceState()` is the only place the precedence between them is
 * decided, and it is decided once.
 *
 * Precedence is **failure → loading → empty → ready**. A failure outranks a
 * spinner because a failed read has already stopped loading; an empty list
 * outranks nothing, because a list that is still loading is not empty yet.
 */

import Link from "next/link";
import type { ReactNode } from "react";

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
        "skeleton rounded-[var(--radius-sm)] bg-surface-sunken",
        className,
      )}
    />
  );
}

/** A table-shaped skeleton: the header row, then N body rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-[var(--control-lg)] w-full rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}

export type EmptyStateProps = {
  title: string;
  description: string;
  icon?: IconName;
  /** The action that fills the empty state. */
  action?: { label: string; href: string };
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon = "empty",
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-[var(--space-md)] px-[var(--space-xl)] py-[var(--space-giant)] text-center",
        className,
      )}
    >
      {/*
        A medallion rather than a flat tile: it is an *object* on the page, so it
        gets an edge and a highlight. It is deliberately not blurred — there is
        nothing behind it worth refracting, and a `backdrop-filter` on a 56 px
        disc inside a scrolling page is a compositor layer for no pixels of
        difference.
      */}
      <span className="glass-medallion grid size-14 place-items-center rounded-[var(--radius-pill)] text-text-tertiary">
        <Icon name={icon} size="xl" />
      </span>
      <div className="max-w-[var(--measure-narrow)]">
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
 * The sentence comes from `failureMessage`, never from the backend — a raw
 * server string is written for a developer, and printing it here would be the
 * one place the UI showed text it did not choose (see `lib/messages.ts`). The
 * raw message is kept in a `<details>` so it is available to whoever is
 * debugging without being the thing the listener reads first.
 */
export function ErrorState({ failure, retryHref, className }: ErrorStateProps) {
  // A lost connection is not this component's story to tell. Callers that reach
  // for `ErrorState` directly (the shell layout does) still get the right
  // treatment, and there is exactly one implementation of it.
  if (failure.kind === "offline") {
    return <OfflineState failure={failure} retryHref={retryHref} className={className} />;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-[var(--space-md)] px-[var(--space-xl)] py-[var(--space-xxl)]",
        className,
      )}
      role="alert"
    >
      <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-danger-soft text-danger">
        <Icon name="error" size="lg" />
      </span>

      <div>
        <p className="type-body-strong text-text">This section could not load</p>
        <p className="type-caption text-text-tertiary mt-[var(--space-xs)]">
          {failureMessage(failure)}
        </p>
      </div>

      {retryHref && isRetryable(failure) ? (
        <Button asChild variant="secondary" size="md">
          <Link href={retryHref}>Try again</Link>
        </Button>
      ) : null}

      {failure.message ? (
        <details className="type-caption text-text-tertiary">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <p className="mt-[var(--space-xs)] break-all" dir="ltr">
            {failure.message}
          </p>
        </details>
      ) : null}
    </div>
  );
}

/**
 * The offline state, in a surface.
 *
 * Separate from `ErrorState` on purpose. A server error is something that broke
 * and may need a person; being offline is a condition that resolves itself and
 * is nobody's fault, so it gets the warning channel rather than the danger one,
 * and it does not pretend to be an alarm — `role="status"`, not `role="alert"`.
 *
 * The copy says "no connection", not "reconnecting". The app has no background
 * reconnect loop, and a UI that claims to be doing something it is not is the
 * one lie a status line must never tell.
 */
export function OfflineState({
  failure,
  retryHref,
  className,
}: {
  failure?: ActFailure;
  retryHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-warning/25 bg-warning-soft px-[var(--space-lg)] py-[var(--space-md)]",
        className,
      )}
      role="status"
    >
      <p className="type-body-strong flex items-center gap-[var(--space-sm)] text-warning">
        <Icon name="offline" size="sm" />
        No connection
      </p>
      <p className="type-caption text-text-secondary">
        {failure ? failureMessage(failure) : "The server could not be reached."}
      </p>
      {retryHref ? (
        <Button asChild variant="secondary" size="md">
          <Link href={retryHref}>Try again</Link>
        </Button>
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
        "bg-warning-soft px-[var(--space-lg)] py-[var(--space-md)] text-warning",
        className,
      )}
      role="status"
    >
      <Icon name="offline" size="sm" />
      <p className="type-caption">The server connection is down. What you see may be out of date.</p>
    </div>
  );
}

/**
 * One surface's state, as a value.
 *
 * A discriminated union rather than four optional props, because the wrapper
 * must be able to prove it handled every case — and because `status: "empty"`
 * carrying the copy it needs means a surface cannot render an empty state that
 * forgot to say what is empty.
 */
export type SurfaceState =
  | { status: "ready" }
  | { status: "loading"; skeleton?: ReactNode }
  | { status: "empty"; empty: EmptyStateProps }
  | { status: "error"; failure: ActFailure; retryHref?: string }
  | { status: "offline"; failure: ActFailure; retryHref?: string };

export type SurfaceInput = {
  /** The read's failure, or null/undefined when it succeeded. */
  failure?: ActFailure | null;
  /** True while a route is still resolving and the previous page is showing. */
  loading?: boolean;
  /**
   * The empty state's copy — passed **only** when the surface has nothing to
   * show. `null` means "there is something here", which is why this is an object
   * rather than a boolean plus a second object the caller might forget.
   */
  empty?: EmptyStateProps | null;
  /** What to draw while loading. Defaults to a table skeleton. */
  skeleton?: ReactNode;
  /** Where "try again" goes. */
  retryHref?: string;
};

/**
 * Decide which of the four states a surface is in.
 *
 * The order is the whole point: a failure has already stopped loading, and a
 * list that is still loading is not empty yet.
 */
export function surfaceState({
  failure,
  loading = false,
  empty = null,
  skeleton,
  retryHref,
}: SurfaceInput): SurfaceState {
  if (failure) {
    return failure.kind === "offline"
      ? { status: "offline", failure, retryHref }
      : { status: "error", failure, retryHref };
  }
  if (loading) {
    return { status: "loading", skeleton };
  }
  if (empty) {
    return { status: "empty", empty };
  }
  return { status: "ready" };
}

/**
 * Renders exactly one of the four states, or the surface itself.
 *
 * The `never` in the default branch is the point: adding a fifth status to
 * `SurfaceState` without handling it here is a compile error, not a blank
 * region on a page.
 */
export function StateWrapper({
  state,
  children,
  className,
}: {
  state: SurfaceState;
  children: ReactNode;
  className?: string;
}) {
  switch (state.status) {
    case "ready":
      return <>{children}</>;
    case "loading":
      return <>{state.skeleton ?? <TableSkeleton />}</>;
    case "empty":
      return <EmptyState {...state.empty} className={cn(state.empty.className, className)} />;
    case "error":
      return <ErrorState failure={state.failure} retryHref={state.retryHref} className={className} />;
    case "offline":
      return (
        <OfflineState failure={state.failure} retryHref={state.retryHref} className={className} />
      );
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}
