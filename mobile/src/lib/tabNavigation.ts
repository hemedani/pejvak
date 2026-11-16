/**
 * The dock's five destinations, as routes.
 *
 * Playlists is deliberately absent. It is a *library view* now — a chip beside
 * Tracks, Folders and Recent — because a playlist is a way of arranging the
 * library you already have rather than a separate place to go. The dock's five
 * slots belong to the five things a listener opens on their own terms.
 *
 * Stats is absent for the mirror-image reason: it is the other reading of the
 * History records rather than a place of its own, so it sits behind a chip
 * beside them. The slot it vacated belongs to AI.
 */
export const TAB_NAMES = [
  "index",
  "history",
  "discover",
  "notes",
  "ai",
] as const;

export type TabName = (typeof TAB_NAMES)[number];

const TAB_HREFS = {
  index: "/",
  history: "/history",
  discover: "/discover",
  notes: "/notes",
  ai: "/ai",
} as const satisfies Record<TabName, string>;

function firstPathSegment(pathname: string): string | null {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "";
  return (
    withoutQuery
      .split("/")
      .find((segment) => segment.length > 0 && !segment.startsWith("(")) ?? null
  );
}

/**
 * The dock's active destination for a router pathname.
 *
 * Group segments (`(tabs)`) are not part of the URL the listener sees, so they
 * are skipped rather than mistaken for a destination. A path outside the five
 * tabs can only be rendered while the dock is mounted if a tab screen itself
 * pushed it, in which case the library is the honest fallback.
 */
export function tabNameForPathname(pathname: string): TabName {
  const first = firstPathSegment(pathname);

  if (!first || first === "index") {
    return "index";
  }
  return TAB_NAMES.find((name) => name === first) ?? "index";
}

/**
 * Whether a pathname belongs to a tab screen.
 *
 * The tab layout draws the dock — including the now-playing half — so a second
 * mini-player must not be layered over it. This is deliberately not
 * `tabNameForPathname(...) !== ...`: that function falls back to the library for
 * every non-tab path, which would make a detail screen look like a tab.
 */
export function isTabPathname(pathname: string): boolean {
  const path = stripGroups(pathname.split("?")[0] ?? "").replace(/\/+$/, "");
  if (!path || path === "/" || path === "/index") {
    return true;
  }
  // Matched against the whole path, not its first segment. `/ai/transcribe` is a
  // pushed screen that happens to live under a tab's name; treating it as the
  // tab would tell the root layout to skip the mini-player on a screen that has
  // no dock of its own, and the listener would lose the now-playing row.
  return TAB_NAMES.some((name) => path === TAB_HREFS[name]);
}

/**
 * Drops group segments (`(tabs)`, `(auth)`) from a pathname.
 *
 * The router reports the path it resolved, which may still carry the group the
 * file lives in; the listener never sees those segments, and the tab hrefs do
 * not have them.
 */
function stripGroups(pathname: string): string {
  const kept = pathname
    .split("/")
    .filter((segment) => segment.length > 0 && !segment.startsWith("("));
  return `/${kept.join("/")}`;
}

export function tabHref(name: TabName) {
  return TAB_HREFS[name];
}
