"use client";

/**
 * The operator console's navigation.
 *
 * Separate from the listener sidebar on purpose: the panel has no player, no
 * queue and no library. It is a different product surface behind the same login,
 * and sharing a nav would make the player look available where it is not.
 *
 * `/admin` is matched exactly. The shared `NavLink` treats every non-root href as
 * a prefix, which would leave "Overview" highlighted on every page beneath it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type AdminNavItem = { href: string; label: string; icon: IconName };

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/analytics", label: "Analytics", icon: "activity" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/plans", label: "Plans", icon: "plan" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "repeat" },
  { href: "/admin/transactions", label: "Transactions", icon: "receipt" },
  { href: "/admin/audit", label: "Audit", icon: "audit" },
  { href: "/admin/platform", label: "Platform", icon: "platform" },
];

export function AdminNav({ orientation = "column" }: { orientation?: "column" | "strip" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin navigation"
      className={cn(
        orientation === "column"
          ? "flex flex-col gap-[var(--space-xxs)]"
          : "scrollbar-thin flex gap-[var(--space-xs)] overflow-x-auto pb-[var(--space-sm)]",
      )}
    >
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = item.href === "/admin"
          ? pathname === "/admin"
          : pathname.startsWith(item.href);

        return (
          <div key={item.href} className={orientation === "strip" ? "shrink-0" : undefined}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-[var(--space-md)] rounded-[var(--radius-md)] px-[var(--space-md)]",
                "type-label transition-colors",
                orientation === "column" ? "h-11" : "h-10",
                active
                  ? "bg-accent-soft text-text"
                  : "text-text-secondary hover:bg-surface-sunken hover:text-text",
              )}
            >
              <Icon name={item.icon} size="md" className={active ? "text-accent" : undefined} />
              <span className="truncate">{item.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
