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

  it("fails as a rejection, never as a synchronous throw", () => {
    // Callers write `PlaylistService.create(x).catch(...)`, which never runs if
    // the throw escapes before the promise is handed back. The `.catch` here is
    // only to keep the rejection from surfacing as unhandled.
    expect(() => {
      void PlaylistService.create("   ").catch(() => undefined);
    }).not.toThrow();
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

describe("PlaylistService.addTracks", () => {
  it("appends every track with a single read and a single write", async () => {
    // The point of the bulk call: adding a whole folder must not cost one
    // query and one update per track.
    getPlaylistById.mockResolvedValue(playlist(["a"]));

    await PlaylistService.addTracks("p1", ["b", "c", "d"]);

    expect(getPlaylistById).toHaveBeenCalledTimes(1);
    expect(updatePlaylist).toHaveBeenCalledTimes(1);
    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "a", order: 0 },
        { trackId: "b", order: 1 },
        { trackId: "c", order: 2 },
        { trackId: "d", order: 3 },
      ],
    });
  });

  it("adds only the tracks the playlist does not already hold", async () => {
    getPlaylistById.mockResolvedValue(playlist(["a", "b"]));

    await PlaylistService.addTracks("p1", ["b", "c"]);

    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "a", order: 0 },
        { trackId: "b", order: 1 },
        { trackId: "c", order: 2 },
      ],
    });
  });

  it("still normalises when nothing was added", async () => {
    getPlaylistById.mockResolvedValue(playlist(["a", "b"]));

    await PlaylistService.addTracks("p1", ["a", "b"]);

    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "a", order: 0 },
        { trackId: "b", order: 1 },
      ],
    });
  });

  it("does nothing when the playlist is missing", async () => {
    getPlaylistById.mockResolvedValue(null);

    await PlaylistService.addTracks("p1", ["a"]);

    expect(updatePlaylist).not.toHaveBeenCalled();
  });

  it("is reachable by destructuring, not just by property access", async () => {
    // The service is composed from module functions precisely so this works.
    getPlaylistById.mockResolvedValue(playlist([]));
    const { addTracks } = PlaylistService;

    await addTracks("p1", ["a"]);

    expect(updatePlaylist).toHaveBeenCalledTimes(1);
  });
});

describe("PlaylistService.removeTracks", () => {
  it("removes several tracks and keeps the order contiguous", async () => {
    getPlaylistById.mockResolvedValue(playlist(["a", "b", "c", "d"]));

    await PlaylistService.removeTracks("p1", ["b", "d"]);

    expect(updatePlaylist).toHaveBeenCalledWith("p1", {
      items: [
        { trackId: "a", order: 0 },
        { trackId: "c", order: 1 },
      ],
    });
  });

  it("does nothing when the playlist is missing", async () => {
    getPlaylistById.mockResolvedValue(null);

    await PlaylistService.removeTracks("p1", ["a"]);

    expect(updatePlaylist).not.toHaveBeenCalled();
  });
});

describe("PlaylistService.createWithTracks", () => {
  it("inserts the playlist and its items in one write", async () => {
    // Create-then-add would leave a half-created playlist visible to the sync
    // engine if the second write never landed.
    insertPlaylist.mockResolvedValue(playlist(["a", "b"]));

    await PlaylistService.createWithTracks("  Focus  ", ["a", "b"]);

    expect(insertPlaylist).toHaveBeenCalledTimes(1);
    expect(insertPlaylist).toHaveBeenCalledWith({
      title: "Focus",
      items: [
        { trackId: "a", order: 0 },
        { trackId: "b", order: 1 },
      ],
    });
    expect(updatePlaylist).not.toHaveBeenCalled();
  });

  it("collapses duplicates in the selection", async () => {
    insertPlaylist.mockResolvedValue(playlist(["a"]));

    await PlaylistService.createWithTracks("Focus", ["a", "a"]);

    expect(insertPlaylist).toHaveBeenCalledWith({
      title: "Focus",
      items: [{ trackId: "a", order: 0 }],
    });
  });

  it("can create an empty playlist", async () => {
    insertPlaylist.mockResolvedValue(playlist([]));

    await PlaylistService.createWithTracks("Focus", []);

    expect(insertPlaylist).toHaveBeenCalledWith({ title: "Focus", items: [] });
  });

  it("rejects a blank title before touching the database", async () => {
    await expect(PlaylistService.createWithTracks("   ", ["a"])).rejects.toThrow(
      /title is required/i,
    );
    expect(insertPlaylist).not.toHaveBeenCalled();
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
