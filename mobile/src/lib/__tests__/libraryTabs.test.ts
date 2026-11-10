import {
  hasBothOrigins,
  libraryTabs,
  resolveLibraryView,
  resolveTrackOrigin,
  splitTracksByOrigin,
  TRACK_ORIGIN_TABS,
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

describe("the Tracks view's origin sub-tab", () => {
  it("names the two kinds the way the badges do", () => {
    // Same words as `OriginBadge`, so the control and the rows below it cannot
    // describe the same fact two different ways.
    expect(TRACK_ORIGIN_TABS.map((tab) => tab.label)).toEqual(["Local", "Online"]);
    expect(TRACK_ORIGIN_TABS.map((tab) => tab.icon)).toEqual(["device", "stream"]);
  });

  it("is only a choice when both kinds are present", () => {
    expect(hasBothOrigins({ local: 12, online: 3 })).toBe(true);
    expect(hasBothOrigins({ local: 12, online: 0 })).toBe(false);
    expect(hasBothOrigins({ local: 0, online: 3 })).toBe(false);
    expect(hasBothOrigins({ local: 0, online: 0 })).toBe(false);
  });

  it("follows the data when there is nothing to switch between", () => {
    // A remembered "Online" with no online tracks left would open an empty list
    // behind a control that had just disappeared — a dead end.
    expect(resolveTrackOrigin("online", { local: 4, online: 0 })).toBe("local");
    expect(resolveTrackOrigin(null, { local: 0, online: 4 })).toBe("online");
    expect(resolveTrackOrigin("local", { local: 0, online: 4 })).toBe("online");
    expect(resolveTrackOrigin(null, { local: 0, online: 0 })).toBe("local");
  });

  it("honours a real choice, and opens on Local", () => {
    expect(resolveTrackOrigin(null, { local: 4, online: 4 })).toBe("local");
    expect(resolveTrackOrigin("online", { local: 4, online: 4 })).toBe("online");
    expect(resolveTrackOrigin("local", { local: 4, online: 4 })).toBe("local");
  });
});

describe("splitTracksByOrigin", () => {
  // A row's `origin` is normalised to `local` or `online` on the way out of the
  // database (`toTrackOrigin`), so these are the only two shapes the split can
  // ever see. A legacy row with no column lands in `local` before it gets here.
  const track = (id: string, origin: "local" | "online") => ({ id, origin });

  it("puts every track in exactly one half", () => {
    const tracks = [
      track("a", "local"),
      track("b", "online"),
      track("c", "local"),
      track("d", "online"),
    ];

    const { local, online } = splitTracksByOrigin(tracks);

    expect(local.map((item) => item.id)).toEqual(["a", "c"]);
    expect(online.map((item) => item.id)).toEqual(["b", "d"]);
    expect(local.length + online.length).toBe(tracks.length);
  });

  it("never puts the same track in both halves", () => {
    const { local, online } = splitTracksByOrigin([
      track("a", "local"),
      track("b", "online"),
    ]);

    const all = [...local, ...online].map((item) => item.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps the order it was given, per half", () => {
    const { online } = splitTracksByOrigin([
      track("first", "online"),
      track("skip", "local"),
      track("second", "online"),
    ]);

    expect(online.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("gives two empty halves for an empty library", () => {
    expect(splitTracksByOrigin([])).toEqual({ local: [], online: [] });
  });

  it("agrees with the counts the sub-tab is gated on", () => {
    // The control appears from these two numbers, so they must be the length of
    // the lists the rows are drawn from — not a second, separately computed pair.
    const tracks = [track("a", "local"), track("b", "online"), track("c", "local")];
    const { local, online } = splitTracksByOrigin(tracks);
    const counts = { local: local.length, online: online.length };

    expect(hasBothOrigins(counts)).toBe(true);
    expect(resolveTrackOrigin("online", counts)).toBe("online");
    expect(resolveTrackOrigin("local", counts)).toBe("local");
  });
});
