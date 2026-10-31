import { libraryTabs, resolveLibraryView } from "@/lib/libraryTabs";

describe("libraryTabs", () => {
  it("keeps the three library tabs when no language is chosen", () => {
    expect(libraryTabs(false).map((tab) => tab.value)).toEqual([
      "tracks",
      "folders",
      "recent",
    ]);
  });

  it("puts the language tab first when a language is chosen", () => {
    expect(libraryTabs(true).map((tab) => tab.value)).toEqual([
      "language",
      "tracks",
      "folders",
      "recent",
    ]);
    expect(libraryTabs(true)[0]?.label).toBe("Language");
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
  });

  it("falls back to tracks when the language is cleared while its tab is open", () => {
    expect(resolveLibraryView("language", false)).toBe("tracks");
  });
});
