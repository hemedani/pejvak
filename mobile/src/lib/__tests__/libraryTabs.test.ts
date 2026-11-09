import {
  hasBothTrackSources,
  libraryTabs,
  resolveLibraryView,
  resolveTrackSource,
  TRACK_SOURCE_TABS,
} from "@/lib/libraryTabs";

describe("libraryTabs", () => {
  it("keeps the four library tabs when no language is chosen", () => {
    expect(libraryTabs(false).map((tab) => tab.value)).toEqual([
      "tracks",
      "folders",
      "playlists",
      "recent",
    ]);
  });

  it("puts the language tab first when a language is chosen", () => {
    expect(libraryTabs(true).map((tab) => tab.value)).toEqual([
      "language",
      "tracks",
      "folders",
      "playlists",
      "recent",
    ]);
  });

  it("calls the online shelf Online, not Language", () => {
    // The tab is the shelf of online sources, not the language setting; the
    // language is named on the button that chooses it.
    expect(libraryTabs(true)[0]?.label).toBe("Online");
    expect(libraryTabs(false).map((tab) => tab.label)).not.toContain("Online");
  });

  it("gives every tab its own glyph", () => {
    const icons = libraryTabs(true).map((tab) => tab.icon);
    expect(icons.every((icon) => icon.length > 0)).toBe(true);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("keeps Playlists between Folders and Recent", () => {
    // A playlist groups the same files a folder does, so it sits after the
    // folders and before the recency list — never before the folders, which
    // would say it is a kind of container on the device.
    const order = libraryTabs(false).map((tab) => tab.value);
    expect(order.indexOf("playlists")).toBe(order.indexOf("folders") + 1);
    expect(order.indexOf("playlists")).toBe(order.indexOf("recent") - 1);
  });
});

describe("resolveLibraryView", () => {
  it("opens on the language tab when a language is chosen", () => {
    expect(resolveLibraryView(null, true)).toBe("language");
  });

  it("opens on tracks when no language is chosen", () => {
    expect(resolveLibraryView(null, false)).toBe("tracks");
  });

  it("keeps a view the listener picked", () => {
    expect(resolveLibraryView("recent", true)).toBe("recent");
    expect(resolveLibraryView("playlists", true)).toBe("playlists");
  });

  it("falls back to tracks when the language is cleared while its tab is open", () => {
    expect(resolveLibraryView("language", false)).toBe("tracks");
  });
});

describe("the Tracks view's source sub-tab", () => {
  it("names the two kinds the way the badges do", () => {
    // Same words as `OriginBadge`, so the control and the rows below it cannot
    // describe the same fact two different ways.
    expect(TRACK_SOURCE_TABS.map((tab) => tab.label)).toEqual(["Local", "Online"]);
    expect(TRACK_SOURCE_TABS.map((tab) => tab.icon)).toEqual(["device", "stream"]);
  });

  it("is only a choice when both kinds are present", () => {
    expect(hasBothTrackSources({ local: 12, online: 3 })).toBe(true);
    expect(hasBothTrackSources({ local: 12, online: 0 })).toBe(false);
    expect(hasBothTrackSources({ local: 0, online: 3 })).toBe(false);
    expect(hasBothTrackSources({ local: 0, online: 0 })).toBe(false);
  });

  it("follows the data when there is nothing to switch between", () => {
    // A remembered "Online" with no online tracks left would open an empty list
    // behind a control that had just disappeared — a dead end.
    expect(resolveTrackSource("online", { local: 4, online: 0 })).toBe("local");
    expect(resolveTrackSource(null, { local: 0, online: 4 })).toBe("online");
    expect(resolveTrackSource("local", { local: 0, online: 4 })).toBe("online");
    expect(resolveTrackSource(null, { local: 0, online: 0 })).toBe("local");
  });

  it("honours a real choice, and opens on Local", () => {
    expect(resolveTrackSource(null, { local: 4, online: 4 })).toBe("local");
    expect(resolveTrackSource("online", { local: 4, online: 4 })).toBe("online");
    expect(resolveTrackSource("local", { local: 4, online: 4 })).toBe("local");
  });
});
