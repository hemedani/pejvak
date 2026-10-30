/**
 * Where the app can go.
 *
 * One list, two renderings (a column on desktop, a scrolling strip on mobile) —
 * so a destination cannot exist in one and be missing from the other, which is
 * how a mobile nav silently loses a screen.
 */

import type { NavItem } from "./nav-link";

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "خانه", icon: "home" },
  { href: "/library", label: "کتابخانه", icon: "library" },
  { href: "/history", label: "تاریخ شنیدن", icon: "history" },
  { href: "/playlists", label: "فهرست‌ها", icon: "playlist" },
  { href: "/browse", label: "کاوش", icon: "browse" },
  { href: "/player", label: "پخش", icon: "player" },
  { href: "/settings", label: "تنظیمات", icon: "settings" },
];
