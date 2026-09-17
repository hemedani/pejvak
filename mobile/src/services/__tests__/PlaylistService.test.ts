import type { LocalPlaylist, LocalTrack } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getPlaylists: jest.fn(),
    getPlaylistById: jest.fn(),
    getAllTracks: jest.fn(),
    insertPlaylist: jest.fn(),
    updatePlaylist: jest.fn(),
    softDeletePlaylist: jest.fn(),
  },
}));

const getPlaylistById = jest.mocked(LocalDBService.getPlaylistById);
const getAllTracks = jest.mocked(LocalDBService.getAllTracks);
const insertPlaylist = jest.mocked(LocalDBService.insertPlaylist);
const updatePlaylist = jest.mocked(LocalDBService.updatePlaylist);
const softDeletePlaylist = jest.mocked(LocalDBService.softDeletePlaylist);

function playlist(ids: string[]): LocalPlaylist {
  return {
    id: "p1",
    serverId: null,
    title: "Focus",
    description: null,
    isPublic: false,
    items: ids.map((trackId, order) => ({ trackId, order })),
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

function track(id: string): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: id.toUpperCase(),
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
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PlaylistService.create", () => {
  it("trims the title before inserting", async () => {
    insertPlaylist.mockResolvedValue(playlist([]));

    await PlaylistService.create("  Focus  ");

    expect(insertPlaylist).toHaveBeenCalledWith({ title: "Focus" });
  });

  it("rejects a blank title", async () => {
    await expect(PlaylistService.create("   ")).rejects.toThrow(/title is required/i);
    expect(insertPlaylist).not.toHaveBeenCalled();
  });
});

describe("PlaylistService.addTrack", () => {
  it("appends a track and persists normalized order", async () => {
    getPlaylistById.mockResolvedValue(playlist(["a", "b"]));

    await PlaylistService.addTrack("p1", "c");

    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "a", order: 0 },
        { trackId: "b", order: 1 },
        { trackId: "c", order: 2 },
      ],
    });
  });

  it("does nothing when the playlist is missing", async () => {
    getPlaylistById.mockResolvedValue(null);

    await PlaylistService.addTrack("p1", "c");

    expect(updatePlaylist).not.toHaveBeenCalled();
  });
});

describe("PlaylistService.moveTrack", () => {
  it("persists the reordered items", async () => {
    getPlaylistById.mockResolvedValue(playlist(["a", "b", "c"]));

    await PlaylistService.moveTrack("p1", 0, 2);

    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "b", order: 0 },
        { trackId: "c", order: 1 },
        { trackId: "a", order: 2 },
      ],
    });
  });
});

describe("PlaylistService.remove", () => {
  it("tombstones by id so the delete can sync", async () => {
    await PlaylistService.remove("p1");
    expect(softDeletePlaylist).toHaveBeenCalledWith("p1");
  });
});

describe("PlaylistService.loadDetail", () => {
  it("resolves ordered tracks against the library", async () => {
    getPlaylistById.mockResolvedValue(playlist(["b", "a"]));
    getAllTracks.mockResolvedValue([track("a"), track("b")]);

    const detail = await PlaylistService.loadDetail("p1");

    expect(detail?.tracks.map((track) => track.id)).toEqual(["b", "a"]);
    expect(detail?.library).toHaveLength(2);
  });

  it("returns null when the playlist is missing", async () => {
    getPlaylistById.mockResolvedValue(null);
    getAllTracks.mockResolvedValue([]);

    expect(await PlaylistService.loadDetail("p1")).toBeNull();
  });
});
