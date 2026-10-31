/**
 * The three shelves under Browse.
 *
 * Links, not buttons, and the tab lives in the URL (`?tab=`): a shelf is a place,
 * so the back button must walk through it, a link to Favorites must be
 * shareable, and the server must be able to render the right shelf on the first
 * paint instead of swapping it in after hydration.
 *
 * No sliding indicator and no animation. Navigation is not a performance, and
 * plan §7.7 rules motion out of it; the active tab is the same accent-soft pill
 * the sidebar uses for the current page, which is the app's one way of saying
 * "you are here".
 *
 * The row scrolls horizontally rather than wrapping: two lines of tabs push the
 * content down and make the header jump between tabs.
 */

import Link from "next/link";

import { cn } from "@/lib/cn";

export type BrowseTab = "continue" | "favorites" | "browse";

const TABS: readonly { tab: BrowseTab; label: string }[] = [
  { tab: "continue", label: "Continue" },
  { tab: "favorites", label: "Saved" },
  { tab: "browse", label: "Browse" },
];

export function browseTabHref(tab: BrowseTab): string {
  return tab === "browse" ? "/browse" : `/browse?tab=${tab}`;
}

export function BrowseTabs({ active }: { active: BrowseTab }) {
  return (
    <nav
      aria-label="Browse sections"
      className="-mx-[var(--space-xs)] flex gap-[var(--space-xs)] overflow-x-auto px-[var(--space-xs)] pb-[var(--space-xs)]"
    >
      {TABS.map(({ tab, label }) => {
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={browseTabHref(tab)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-[var(--radius-pill)] px-[var(--space-lg)] type-label transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              current
                ? "bg-accent-soft text-text"
                : "text-text-secondary hover:bg-surface-sunken hover:text-text",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
