import {
  addTrackToPlaylist,
  movePlaylistItem,
  normalizeOrder,
  removeTrackFromPlaylist,
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
