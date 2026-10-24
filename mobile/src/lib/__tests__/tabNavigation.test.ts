import { tabHref, tabNameForPathname } from "../tabNavigation";

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

describe("tabHref", () => {
  it("uses the root href for the library and a named href for the rest", () => {
    expect(tabHref("index")).toBe("/");
    expect(tabHref("history")).toBe("/history");
    expect(tabHref("playlists")).toBe("/playlists");
  });
});
