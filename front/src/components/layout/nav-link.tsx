"use client";

/**
 * One sidebar destination.
 *
 * Client-side only because "am I the current page?" is a `usePathname` question.
 * The active state is a filled accent-soft pill with `text` on it — not a colour
 * change alone, so it survives being read in greyscale and by someone who does
 * not distinguish the accent from the canvas.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: IconName };

export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  // `/` would otherwise be a prefix of everything, so it is matched exactly.
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-[var(--space-md)] rounded-[var(--radius-md)] px-[var(--space-md)]",
        "h-11 type-label transition-colors",
        active
          ? "bg-accent-soft text-text"
          : "text-text-secondary hover:bg-surface-sunken hover:text-text",
      )}
    >
      <Icon name={item.icon} size="md" className={active ? "text-accent" : undefined} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
