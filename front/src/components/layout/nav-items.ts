/**
 * Where the app can go.
 *
 * One list, two renderings (a column on desktop, a scrolling strip on mobile) —
 * so a destination cannot exist in one and be missing from the other, which is
 * how a mobile nav silently loses a screen.
 */

import type { NavItem } from "./nav-link";

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/library", label: "Library", icon: "library" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/playlists", label: "Playlists", icon: "playlist" },
  { href: "/browse", label: "Browse", icon: "browse" },
  { href: "/player", label: "Player", icon: "player" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
