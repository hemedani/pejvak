export const TAB_NAMES = [
  "index",
  "history",
  "discover",
  "stats",
  "playlists",
] as const;

export type TabName = (typeof TAB_NAMES)[number];

const TAB_HREFS = {
  index: "/",
  history: "/history",
  discover: "/discover",
  stats: "/stats",
  playlists: "/playlists",
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
  const first = firstPathSegment(pathname);
  if (!first || first === "index") {
    return true;
  }
  return TAB_NAMES.some((name) => name === first);
}

export function tabHref(name: TabName) {
  return TAB_HREFS[name];
}
