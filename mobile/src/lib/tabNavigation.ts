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

/**
 * The dock's active destination for a router pathname.
 *
 * Group segments (`(tabs)`) are not part of the URL the listener sees, so they
 * are skipped rather than mistaken for a destination. A path outside the five
 * tabs can only be rendered while the dock is mounted if a tab screen itself
 * pushed it, in which case the library is the honest fallback.
 */
export function tabNameForPathname(pathname: string): TabName {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "";
  const first = withoutQuery
    .split("/")
    .find((segment) => segment.length > 0 && !segment.startsWith("("));

  if (!first || first === "index") {
    return "index";
  }
  return TAB_NAMES.find((name) => name === first) ?? "index";
}

export function tabHref(name: TabName) {
  return TAB_HREFS[name];
}
