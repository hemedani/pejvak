import {
  addTrackToPlaylist,
  addTracksToPlaylist,
  movePlaylistItem,
  normalizeOrder,
  removeTrackFromPlaylist,
  removeTracksFromPlaylist,
  resolvePlaylistTracks,
} from "@/lib/playlists";
import type { LocalTrack, PlaylistItem } from "@/lib/db/types";

const items = (...ids: string[]): PlaylistItem[] =>
  ids.map((trackId, order) => ({ trackId, order }));

describe("normalizeOrder", () => {
  it("rewrites order to be contiguous from zero", () => {
    expect(normalizeOrder(items("a", "b", "c"))).toEqual(items("a", "b", "c"));
    expect(
      normalizeOrder([
        { trackId: "a", order: 5 },
        { trackId: "b", order: 9 },
      ]),
    ).toEqual([
      { trackId: "a", order: 0 },
      { trackId: "b", order: 1 },
    ]);
  });
});

describe("addTrackToPlaylist", () => {
  it("appends the track with the next order", () => {
    expect(addTrackToPlaylist(items("a", "b"), "c")).toEqual(items("a", "b", "c"));
  });

  it("does not add a duplicate", () => {
    expect(addTrackToPlaylist(items("a", "b"), "a")).toEqual(items("a", "b"));
  });
});

describe("addTracksToPlaylist", () => {
  it("appends every new track in the order given", () => {
    expect(addTracksToPlaylist(items("a"), ["b", "c", "d"])).toEqual(items("a", "b", "c", "d"));
  });

  it("skips the ones already present and appends only the rest", () => {
    expect(addTracksToPlaylist(items("a", "b"), ["b", "c"])).toEqual(items("a", "b", "c"));
  });

  it("is a no-op when every track is already there", () => {
    expect(addTracksToPlaylist(items("a", "b"), ["a", "b"])).toEqual(items("a", "b"));
  });

  it("collapses duplicates within the selection", () => {
    // A folder can hold the same lecture twice under two names; adding both
    // would put two identical rows in the playlist.
    expect(addTracksToPlaylist(items(), ["a", "a", "b"])).toEqual(items("a", "b"));
  });

  it("handles an empty selection and an empty playlist", () => {
    expect(addTracksToPlaylist(items("a"), [])).toEqual(items("a"));
    expect(addTracksToPlaylist(items(), ["a"])).toEqual(items("a"));
    expect(addTracksToPlaylist(items(), [])).toEqual([]);
  });

  it("rewrites a ragged order rather than appending after it", () => {
    // `items.length` is not the same as "the highest order", so a playlist
    // whose orders are sparse must not produce a duplicate order value.
    const ragged: PlaylistItem[] = [
      { trackId: "a", order: 4 },
      { trackId: "b", order: 11 },
    ];
    expect(addTracksToPlaylist(ragged, ["c"])).toEqual(items("a", "b", "c"));
  });

  it("agrees with the single-track helper", () => {
    const base = items("a", "b");
    expect(addTracksToPlaylist(base, ["c"])).toEqual(addTrackToPlaylist(base, "c"));
    expect(addTracksToPlaylist(base, ["a"])).toEqual(addTrackToPlaylist(base, "a"));
  });

  it("does not mutate its input", () => {
    const base = items("a");
    addTracksToPlaylist(base, ["b", "c"]);
    expect(base).toEqual(items("a"));
  });
});

describe("removeTracksFromPlaylist", () => {
  it("removes several tracks and keeps the order contiguous", () => {
    expect(removeTracksFromPlaylist(items("a", "b", "c", "d"), ["b", "d"])).toEqual(items("a", "c"));
  });

  it("is a no-op for unknown ids", () => {
    expect(removeTracksFromPlaylist(items("a", "b"), ["z"])).toEqual(items("a", "b"));
  });

  it("handles removing everything and removing nothing", () => {
    expect(removeTracksFromPlaylist(items("a", "b"), ["a", "b"])).toEqual([]);
    expect(removeTracksFromPlaylist(items("a", "b"), [])).toEqual(items("a", "b"));
  });

  it("does not mutate its input", () => {
    const base = items("a", "b");
    removeTracksFromPlaylist(base, ["a"]);
    expect(base).toEqual(items("a", "b"));
  });
});

describe("removeTrackFromPlaylist", () => {
  it("removes the track and keeps the order contiguous", () => {
    expect(removeTrackFromPlaylist(items("a", "b", "c"), "b")).toEqual(items("a", "c"));
  });

  it("is a no-op for an unknown track", () => {
    expect(removeTrackFromPlaylist(items("a"), "z")).toEqual(items("a"));
  });
});

describe("movePlaylistItem", () => {
  it("moves an item down", () => {
    expect(movePlaylistItem(items("a", "b", "c"), 0, 2)).toEqual(items("b", "c", "a"));
  });

  it("moves an item up", () => {
    expect(movePlaylistItem(items("a", "b", "c"), 2, 1)).toEqual(items("a", "c", "b"));
  });

  it("ignores out-of-range or same-index moves", () => {
    expect(movePlaylistItem(items("a", "b"), 0, 0)).toEqual(items("a", "b"));
    expect(movePlaylistItem(items("a", "b"), 0, 9)).toEqual(items("a", "b"));
    expect(movePlaylistItem(items("a", "b"), -1, 0)).toEqual(items("a", "b"));
  });
});

describe("resolvePlaylistTracks", () => {
  const track = (id: string): LocalTrack => ({
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: `Track ${id}`,
    fileName: null,
    fileUri: null,
    durationSec: 60,
    fileSizeBytes: 1,
    mimeType: null,
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    source: null,
    sourceUri: null,
    sourcePath: null,
    sourceSize: null,
    sourceMtime: null,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
  });

  it("resolves items to tracks in playlist order and drops missing ones", () => {
    const resolved = resolvePlaylistTracks(items("b", "a", "gone"), [track("a"), track("b")]);
    expect(resolved.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
