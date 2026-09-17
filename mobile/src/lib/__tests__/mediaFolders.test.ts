import {
  ROOT_FOLDER_ROUTE_SEGMENT,
  STORAGE_ROOT_FOLDER_NAME,
  deriveFolderKey,
  deriveFolderKeyFromTreeUri,
  folderKeyFromRouteSegment,
  folderKeyToRouteSegment,
  folderNameFromKey,
  naturalCompare,
  orderFolderTracks,
  pickFolderStartIndex,
} from "@/lib/mediaFolders";

describe("deriveFolderKey", () => {
  it("strips the primary storage volume", () => {
    expect(deriveFolderKey("/storage/emulated/0/Music/Lectures/03 - Foo.mp3")).toBe(
      "Music/Lectures",
    );
  });

  it("strips a legacy sdcard mount", () => {
    expect(deriveFolderKey("/sdcard/Lectures/03.mp3")).toBe("Lectures");
  });

  it("strips a removable volume id", () => {
    expect(deriveFolderKey("/storage/1A2B-3C4D/Audio/x.mp3")).toBe("Audio");
  });

  it("strips a file:// scheme", () => {
    expect(deriveFolderKey("file:///storage/emulated/0/Music/x.mp3")).toBe("Music");
  });

  it("returns the empty key for a file at the volume root", () => {
    expect(deriveFolderKey("/storage/emulated/0/x.mp3")).toBe("");
  });

  it("returns null for a content:// uri, which has no usable path", () => {
    expect(deriveFolderKey("content://media/external/audio/media/123")).toBeNull();
  });

  it("returns null for a missing path", () => {
    expect(deriveFolderKey(null)).toBeNull();
  });
});

describe("folderNameFromKey", () => {
  it("uses the last path segment", () => {
    expect(folderNameFromKey("Music/Lectures")).toBe("Lectures");
    expect(folderNameFromKey("Lectures")).toBe("Lectures");
  });

  it("names the storage root rather than leaving it blank", () => {
    expect(folderNameFromKey("")).toBe(STORAGE_ROOT_FOLDER_NAME);
  });
});

describe("folder route segments", () => {
  it("round-trips an ordinary nested key", () => {
    expect(folderKeyFromRouteSegment(folderKeyToRouteSegment("Music/Lectures"))).toBe(
      "Music/Lectures",
    );
  });

  it("substitutes the root folder, whose key is empty and would build /folder/", () => {
    expect(folderKeyToRouteSegment("")).toBe(ROOT_FOLDER_ROUTE_SEGMENT);
    expect(folderKeyFromRouteSegment(ROOT_FOLDER_ROUTE_SEGMENT)).toBe("");
  });

  it("distinguishes a missing route param from the root folder", () => {
    // null means "this screen was opened without a folder"; "" means the
    // storage root. Collapsing the two would load the whole device's root as if
    // it were a real folder.
    expect(folderKeyFromRouteSegment(undefined)).toBeNull();
  });

  it("leaves a real folder that merely starts with a tilde alone", () => {
    expect(folderKeyFromRouteSegment("~backup")).toBe("~backup");
  });
});

describe("deriveFolderKeyFromTreeUri", () => {
  it("decodes a primary-volume tree uri", () => {
    expect(
      deriveFolderKeyFromTreeUri(
        "content://com.android.externalstorage.documents/tree/primary%3AMusic%2FLectures",
      ),
    ).toBe("Music/Lectures");
  });

  it("handles a provider that uses a bare folder name", () => {
    expect(
      deriveFolderKeyFromTreeUri(
        "content://com.android.providers.downloads.documents/tree/downloads",
      ),
    ).toBe("downloads");
  });

  it("returns the empty key for the volume root", () => {
    expect(
      deriveFolderKeyFromTreeUri("content://com.android.externalstorage.documents/tree/primary%3A"),
    ).toBe("");
  });

  it("ignores a document suffix appended to a tree uri", () => {
    expect(
      deriveFolderKeyFromTreeUri(
        "content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2Fa.mp3",
      ),
    ).toBe("Music");
  });

  it("returns null for a uri that is not a SAF grant", () => {
    expect(deriveFolderKeyFromTreeUri("content://media/external/audio/media/1")).toBeNull();
  });
});

describe("naturalCompare", () => {
  it("orders embedded numbers numerically", () => {
    expect(naturalCompare("lecture 2", "lecture 10")).toBeLessThan(0);
    expect(naturalCompare("lecture 10", "lecture 2")).toBeGreaterThan(0);
  });

  it("is case insensitive", () => {
    expect(naturalCompare("Alpha", "alpha")).toBe(0);
  });

  it("keeps zero-padded equivalents stable", () => {
    expect(naturalCompare("02 - a", "2 - a")).not.toBe(0);
  });
});

describe("orderFolderTracks", () => {
  const track = (fileName: string, trackNumber: number | null, discNumber: number | null = null) => ({
    fileName,
    title: fileName,
    trackNumber,
    discNumber,
  });

  it("orders by disc then track number when every track is numbered", () => {
    const ordered = orderFolderTracks([
      track("disc2-01.mp3", 1, 2),
      track("disc1-02.mp3", 2, 1),
      track("disc1-01.mp3", 1, 1),
    ]);
    expect(ordered.map((item) => item.fileName)).toEqual([
      "disc1-01.mp3",
      "disc1-02.mp3",
      "disc2-01.mp3",
    ]);
  });

  it("treats a missing disc number as disc one", () => {
    const ordered = orderFolderTracks([track("b.mp3", 2), track("a.mp3", 1)]);
    expect(ordered.map((item) => item.fileName)).toEqual(["a.mp3", "b.mp3"]);
  });

  it("falls back to a natural filename sort when numbering is partial", () => {
    // A half-numbered folder must not interleave numbered and unnumbered files.
    const ordered = orderFolderTracks([
      track("lecture 10.mp3", null),
      track("lecture 2.mp3", 5),
      track("lecture 1.mp3", null),
    ]);
    expect(ordered.map((item) => item.fileName)).toEqual([
      "lecture 1.mp3",
      "lecture 2.mp3",
      "lecture 10.mp3",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [track("b.mp3", 2), track("a.mp3", 1)];
    orderFolderTracks(input);
    expect(input.map((item) => item.fileName)).toEqual(["b.mp3", "a.mp3"]);
  });
});

describe("pickFolderStartIndex", () => {
  it("starts at the first unfinished track", () => {
    expect(pickFolderStartIndex([true, true, false, false])).toBe(2);
  });

  it("restarts a fully finished folder from the top", () => {
    expect(pickFolderStartIndex([true, true])).toBe(0);
  });

  it("handles an empty folder", () => {
    expect(pickFolderStartIndex([])).toBe(0);
  });
});
