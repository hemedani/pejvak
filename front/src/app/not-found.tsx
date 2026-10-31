import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-[var(--space-lg)]">
      <div className="flex max-w-[44ch] flex-col items-center gap-[var(--space-md)] text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-surface-sunken text-text-tertiary">
          <Icon name="search" size="xl" />
        </span>
        <h1 className="type-heading text-text">This page could not be found</h1>
        <p className="type-caption text-text-tertiary">
          The address may have changed, or the item you were looking for may have been removed.
        </p>
        <Button asChild variant="primary" size="md">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </main>
  );
}
