import { isTabPathname, tabHref, tabNameForPathname } from "../tabNavigation";

describe("tabNameForPathname", () => {
  it.each([
    ["/", "index"],
    ["/history", "history"],
    ["/discover", "discover"],
    ["/stats", "stats"],
    ["/playlists", "playlists"],
  ])("maps %s to %s", (pathname, expected) => {
    expect(tabNameForPathname(pathname)).toBe(expected);
  });

  it("ignores a trailing slash", () => {
    expect(tabNameForPathname("/history/")).toBe("history");
    expect(tabNameForPathname("/")).toBe("index");
  });

  it("ignores group segments from the router", () => {
    expect(tabNameForPathname("/(tabs)/discover")).toBe("discover");
  });

  it("falls back to the library for a non-tab path", () => {
    expect(tabNameForPathname("/online/archive-fa/foo")).toBe("index");
    expect(tabNameForPathname("")).toBe("index");
  });
});

describe("isTabPathname", () => {
  it.each(["/", "/history", "/discover", "/stats", "/playlists", "/(tabs)/discover"])(
    "treats %s as a tab",
    (pathname) => {
      expect(isTabPathname(pathname)).toBe(true);
    },
  );

  it("does not treat a pushed screen as a tab", () => {
    expect(isTabPathname("/online/language/fa")).toBe(false);
    expect(isTabPathname("/track/abc")).toBe(false);
    expect(isTabPathname("/settings")).toBe(false);
  });
});

describe("tabHref", () => {
  it("uses the root href for the library and a named href for the rest", () => {
    expect(tabHref("index")).toBe("/");
    expect(tabHref("history")).toBe("/history");
    expect(tabHref("playlists")).toBe("/playlists");
  });
});
