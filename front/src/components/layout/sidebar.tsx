import Link from "next/link";

import { NavLink } from "./nav-link";
import { NAV_ITEMS } from "./nav-items";

/**
 * The desktop sidebar.
 *
 * It sits on the *start* edge — the right, in RTL — and the layout uses logical
 * properties so nothing here has to know that. The bottom slot is reserved for
 * the player bar's queue entry (Phase 5); nothing occupies it yet, and an empty
 * box that grows when the player arrives is better than a bar that moves.
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-[var(--space-xl)] border-e border-outline-variant bg-canvas-elevated px-[var(--space-md)] py-[var(--space-xl)] lg:flex">
      <Link
        href="/"
        className="flex items-center gap-[var(--space-sm)] px-[var(--space-sm)] text-text"
      >
        <BrandMark />
        <span className="type-heading">پژواک</span>
      </Link>

      <nav aria-label="ناوبری اصلی" className="flex flex-col gap-[var(--space-xxs)]">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      <div className="mt-auto" id="sidebar-player-slot" />
    </aside>
  );
}

/** Two nested arcs — an echo, drawn rather than imported. */
function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden fill="none">
      <circle cx="13" cy="13" r="4" fill="var(--accent)" />
      <path
        d="M6.4 6.4a9.3 9.3 0 0 0 0 13.2M19.6 6.4a9.3 9.3 0 0 1 0 13.2"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
