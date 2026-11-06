import { libraryTabs, resolveLibraryView } from "@/lib/libraryTabs";

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
