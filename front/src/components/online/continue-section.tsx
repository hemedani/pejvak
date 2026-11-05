/**
 * The dashboard's answer to "what was I doing?".
 *
 * The four stat cells say what has been heard; this says where the listener
 * stopped. It is the same shelf Browse's Continue tab draws, capped to one row,
 * because the two answer the same question and a second card design would
 * eventually disagree about the order, the resume position or the progress bar.
 *
 * A section, not a card: the shelf already has four surfaces of its own, and a
 * card around them would make the page read as two columns of boxes. The
 * "See all" link leads to the full shelf, which is where a fifth run lives.
 *
 * Failure is stated where the section is, like the activity chart: the totals
 * below are still true, so the page does not vanish because this read did.
 */

import Link from "next/link";

import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ErrorState } from "@/components/ui/state";
import type { ContinueItem } from "@/lib/online/continue";
import type { ActFailure } from "@/lib/result";
import { ContinueShelf } from "./continue-shelf";

export function ContinueSection({
  items,
  failure,
}: {
  items: readonly ContinueItem[];
  failure?: ActFailure;
}) {
  if (items.length === 0 && failure === undefined) {
    return null;
  }

  return (
    <section aria-label="Continue listening" className="flex flex-col gap-[var(--space-md)]">
      <CardHeading
        overline="Pick up where you left off"
        title="Continue listening"
        action={
          <Link
            href="/browse?tab=continue"
            className="type-label inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            See all
            <Icon name="end" size="xs" />
          </Link>
        }
      />

      {failure === undefined ? (
        <ContinueShelf items={items} />
      ) : (
        <Card>
          <ErrorState failure={failure} retryHref="/" />
        </Card>
      )}
    </section>
  );
}
