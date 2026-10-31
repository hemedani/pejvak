/**
 * What a failed third-party read looks like.
 *
 * Distinct from `ErrorState` because the cause is distinct: the backend is fine,
 * the listener's shelf is fine, and one source on the internet did not answer.
 * That is not "this section failed to load" — it is "we could not reach
 * manahej.ir", and the sentence has to say so or the listener will restart their
 * router.
 *
 * The source's own error never appears here. It is not actionable for the
 * listener and a raw stack reads as a crash, so the sentence is chosen for them. The sentence comes from `problems.ts`; the technical detail
 * is kept behind a disclosure for whoever is debugging.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { onlineProblemMessage, type OnlineProblemCode } from "@/lib/online/problems";

/** A retry only helps when the source might answer differently next time. */
const RETRYABLE: ReadonlySet<OnlineProblemCode> = new Set(["offline", "timeout", "invalid_response"]);

export function SourceProblem({
  code,
  sourceName,
  retryHref,
  detail,
}: {
  code: OnlineProblemCode;
  /** The provider's name, so the sentence names the thing that did not answer. */
  sourceName?: string;
  retryHref?: string;
  /** The technical message, shown only inside the disclosure. */
  detail?: string;
}) {
  const offline = code === "offline" || code === "timeout";

  return (
    <div className="flex flex-col items-start gap-[var(--space-md)] px-[var(--space-xl)] py-[var(--space-xxl)]" role="alert">
      <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-danger-soft text-danger">
        <Icon name={offline ? "offline" : "warning"} size="lg" />
      </span>

      <div>
        <p className="type-body-strong text-text">
          {sourceName ? `${sourceName} did not respond` : "The source did not respond"}
        </p>
        <p className="type-caption mt-[var(--space-xs)] max-w-[52ch] text-text-tertiary">
          {onlineProblemMessage(code)}
        </p>
      </div>

      {retryHref && RETRYABLE.has(code) ? (
        <Button asChild variant="secondary" size="md">
          <Link href={retryHref}>Try again</Link>
        </Button>
      ) : null}

      {detail ? (
        <details className="type-caption text-text-tertiary">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <p className="mt-[var(--space-xs)] break-all" dir="ltr">
            {detail}
          </p>
        </details>
      ) : null}
    </div>
  );
}
