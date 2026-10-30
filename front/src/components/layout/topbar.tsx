import Link from "next/link";

import { AccountMenu } from "./account-menu";
import { NavLink } from "./nav-link";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import type { CurrentUser } from "@/lib/domain/user";

/**
 * The top bar.
 *
 * On desktop it carries the account menu and the theme switch, and nothing else:
 * a page's own title belongs to the page, and repeating it here costs a line of
 * vertical space on every screen for no information.
 *
 * On mobile it is also the navigation — a scrolling strip of the same
 * `NAV_ITEMS` the sidebar renders, so the two can never disagree about what
 * exists.
 */
export function Topbar({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-[22px] lg:bg-transparent lg:backdrop-blur-none">
      <div className="flex h-16 items-center justify-between gap-[var(--space-md)] px-[var(--space-lg)] lg:px-[var(--space-xxl)]">
        <Link href="/" className="flex items-center gap-[var(--space-sm)] text-text lg:hidden">
          <span className="type-heading">پژواک</span>
        </Link>

        <div className="ms-auto flex items-center gap-[var(--space-xs)]">
          <ThemeToggle />
          <AccountMenu user={user} />
        </div>
      </div>

      <nav
        aria-label="ناوبری اصلی"
        className="scrollbar-thin flex gap-[var(--space-xs)] overflow-x-auto px-[var(--space-lg)] pb-[var(--space-sm)] lg:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <div key={item.href} className="shrink-0">
            <NavLink item={item} />
          </div>
        ))}
      </nav>
    </header>
  );
}
