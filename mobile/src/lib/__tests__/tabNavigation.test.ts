import { isTabPathname, tabHref, tabNameForPathname } from "../tabNavigation";

describe("tabNameForPathname", () => {
  it.each([
    ["/", "index"],
    ["/history", "history"],
    ["/discover", "discover"],
    ["/notes", "notes"],
    ["/ai", "ai"],
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

  it("does not treat the old Playlists route as a destination", () => {
    // Playlists is a Library view now; a stale link must land on the library
    // rather than light up a dock slot that no longer exists.
    expect(tabNameForPathname("/playlists")).toBe("index");
  });

  it("does not treat the old Stats route as a destination", () => {
    // Stats is the second chip of History now, not a screen of its own.
    expect(tabNameForPathname("/stats")).toBe("index");
    expect(isTabPathname("/stats")).toBe(false);
  });
});

describe("isTabPathname", () => {
  it.each(["/", "/history", "/discover", "/notes", "/ai", "/(tabs)/discover"])(
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
    expect(tabHref("notes")).toBe("/notes");
    expect(tabHref("ai")).toBe("/ai");
  });
});
