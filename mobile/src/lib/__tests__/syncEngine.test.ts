import type {
  LocalAnnotation,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  SyncStatus,
} from "@/lib/db/types";
import {
  runSync,
  type PlaylistSyncPayload,
  type SyncStore,
  type SyncTransport,
} from "@/lib/syncEngine";

function track(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: "t1",
    serverId: null,
    contentHash: "hash-1",
    title: "Book",
    fileName: null,
    fileUri: null,
    durationSec: 3600,
    fileSizeBytes: 1024,
    mimeType: null,
    isAudiobook: true,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: 1,
    updatedAt: 1,
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
    ...overrides,
  };
}

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "s1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    startedAt: 100,
    endedAt: 220,
    startPositionSec: 0,
    endPositionSec: 60,
    durationListenedSec: 60,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    syncStatus: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function annotation(overrides: Partial<LocalAnnotation> = {}): LocalAnnotation {
  return {
    id: "a1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    positionSec: 30,
    text: "note",
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function playlist(overrides: Partial<LocalPlaylist> = {}): LocalPlaylist {
  return {
    id: "p1",
    serverId: null,
    title: "Focus",
    description: null,
    isPublic: false,
    items: [],
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createStore(seed: {
  tracks?: LocalTrack[];
  sessions?: LocalSession[];
  annotations?: LocalAnnotation[];
  playlists?: LocalPlaylist[];
}) {
  const tracks = new Map((seed.tracks ?? []).map((item) => [item.id, item]));
  const sessions = new Map((seed.sessions ?? []).map((item) => [item.id, item]));
  const annotations = new Map((seed.annotations ?? []).map((item) => [item.id, item]));
  const playlists = new Map((seed.playlists ?? []).map((item) => [item.id, item]));

  const pending = <T extends { syncStatus: SyncStatus }>(map: Map<string, T>, limit: number) =>
    [...map.values()]
      .filter((row) => row.syncStatus === "pending" || row.syncStatus === "failed")
      .slice(0, limit);

  const store: SyncStore = {
    getPendingTracks: async (limit) => pending(tracks, limit),
    getAllTracks: async () => [...tracks.values()],
    getPendingSessions: async (limit) => pending(sessions, limit),
    getPendingAnnotations: async (limit) => pending(annotations, limit),
    getPendingPlaylists: async (limit) => pending(playlists, limit),
    setTrackSyncStatus: async (id, status, serverId) => {
      const current = tracks.get(id);
      if (current) {
        tracks.set(id, { ...current, syncStatus: status, serverId: serverId ?? current.serverId });
      }
    },
    setSessionSyncStatus: async (id, status, serverId) => {
      const current = sessions.get(id);
      if (current) {
        sessions.set(id, {
          ...current,
          syncStatus: status,
          serverId: serverId ?? current.serverId,
        });
      }
    },
    setAnnotationSyncStatus: async (id, status, serverId) => {
      const current = annotations.get(id);
      if (current) {
        annotations.set(id, {
          ...current,
          syncStatus: status,
          serverId: serverId ?? current.serverId,
        });
      }
    },
    setPlaylistSyncStatus: async (id, status, serverId) => {
      const current = playlists.get(id);
      if (current) {
        playlists.set(id, {
          ...current,
          syncStatus: status,
          serverId: serverId ?? current.serverId,
        });
      }
    },
    removeAnnotation: async (id) => {
      annotations.delete(id);
    },
    removePlaylist: async (id) => {
      playlists.delete(id);
    },
  };

  return { store, tracks, sessions, annotations, playlists };
}

function createTransport(overrides: Partial<SyncTransport> = {}) {
  const calls: {
    registerTrack: LocalTrack[];
    syncLocalData: [LocalSession[], LocalAnnotation[], PlaylistSyncPayload[]][];
  } = { registerTrack: [], syncLocalData: [] };

  const transport: SyncTransport = {
    registerTrack:
      overrides.registerTrack ??
      (async (item) => {
        calls.registerTrack.push(item);
        return { _id: `server-${item.id}` };
      }),
    syncLocalData:
      overrides.syncLocalData ??
      (async (sessions, annotations, playlists) => {
        calls.syncLocalData.push([sessions, annotations, playlists]);
        return {
          syncedSessions: sessions.length,
          syncedAnnotations: annotations.length,
          syncedPlaylists: playlists.length,
          annotations: annotations.map((item) => ({
            clientId: item.id,
            serverId: `server-${item.id}`,
          })),
          playlists: playlists.map((item) => ({
            clientId: item.clientId,
            serverId: `server-${item.clientId}`,
          })),
        };
      }),
  };

  return { transport, calls };
}

describe("runSync", () => {
  it("registers pending tracks and stores the server id", async () => {
    const { store, tracks } = createStore({ tracks: [track()] });
    const { transport, calls } = createTransport();

    const summary = await runSync({ store, transport });

    expect(summary.tracksRegistered).toBe(1);
    expect(calls.registerTrack).toHaveLength(1);
    expect(tracks.get("t1")).toMatchObject({ syncStatus: "synced", serverId: "server-t1" });
  });

  it("syncs finalized sessions and annotations for a synced track", async () => {
    const { store, sessions, annotations } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      sessions: [session()],
      annotations: [annotation()],
    });
    const { transport, calls } = createTransport();

    const summary = await runSync({ store, transport });

    expect(summary.sessionsSynced).toBe(1);
    expect(summary.annotationsSynced).toBe(1);
    expect(sessions.get("s1")?.syncStatus).toBe("synced");
    expect(annotations.get("a1")).toMatchObject({
      syncStatus: "synced",
      serverId: "server-a1",
    });
    expect(calls.syncLocalData).toHaveLength(1);
    expect(calls.syncLocalData[0][0][0]).toMatchObject({ id: "s1", durationListenedSec: 60 });
  });

  it("hard-removes an acknowledged delete tombstone", async () => {
    const { store, annotations } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      annotations: [annotation({ deletedAt: 1234 })],
    });
    const { transport, calls } = createTransport();

    const summary = await runSync({ store, transport });

    expect(annotations.has("a1")).toBe(false);
    expect(summary.annotationsSynced).toBe(1);
    expect(calls.syncLocalData[0][1][0]).toMatchObject({ id: "a1", deletedAt: 1234 });
  });

  it("does not send a session that has not ended", async () => {
    const { store, sessions } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      sessions: [session({ endedAt: null, endPositionSec: null })],
    });
    const { transport, calls } = createTransport();

    const summary = await runSync({ store, transport });

    expect(calls.syncLocalData).toHaveLength(0);
    expect(summary.sessionsSynced).toBe(0);
    expect(sessions.get("s1")?.syncStatus).toBe("pending");
  });

  it("does not send rows whose track is not yet synced", async () => {
    const { store } = createStore({
      tracks: [track({ syncStatus: "failed" })],
      sessions: [session()],
      annotations: [annotation()],
    });
    const { transport, calls } = createTransport({
      registerTrack: async () => {
        throw new Error("offline");
      },
    });

    await runSync({ store, transport });

    expect(calls.syncLocalData).toHaveLength(0);
  });

  it("marks rows failed and stays queued when the batch call throws", async () => {
    const { store, sessions, annotations } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      sessions: [session()],
      annotations: [annotation()],
    });
    const { transport } = createTransport({
      syncLocalData: async () => {
        throw new Error("offline");
      },
    });

    const summary = await runSync({ store, transport });

    expect(summary.failed).toBe(2);
    expect(sessions.get("s1")?.syncStatus).toBe("failed");
    expect(annotations.get("a1")?.syncStatus).toBe("failed");
  });

  it("syncs a playlist, mapping its items to content hashes", async () => {
    const { store, playlists } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      playlists: [playlist({ items: [{ trackId: "t1", order: 0 }] })],
    });
    const { transport, calls } = createTransport();

    const summary = await runSync({ store, transport });

    expect(summary.playlistsSynced).toBe(1);
    expect(playlists.get("p1")).toMatchObject({
      syncStatus: "synced",
      serverId: "server-p1",
    });
    expect(calls.syncLocalData[0][2][0]).toMatchObject({
      clientId: "p1",
      deleted: false,
      items: [{ contentHash: "hash-1", order: 0 }],
    });
  });

  it("defers a playlist whose tracks are not registered yet", async () => {
    const { store, playlists } = createStore({
      tracks: [track()],
      playlists: [playlist({ items: [{ trackId: "t1", order: 0 }] })],
    });
    const { transport, calls } = createTransport({
      registerTrack: async () => {
        throw new Error("offline");
      },
    });

    await runSync({ store, transport });

    expect(calls.syncLocalData).toHaveLength(0);
    expect(playlists.get("p1")?.syncStatus).toBe("pending");
  });

  it("hard-removes an acknowledged playlist delete tombstone", async () => {
    const { store, playlists } = createStore({
      tracks: [track({ syncStatus: "synced", serverId: "server-t1" })],
      playlists: [playlist({ deletedAt: 5000 })],
    });
    const { transport, calls } = createTransport();

    await runSync({ store, transport });

    expect(playlists.has("p1")).toBe(false);
    expect(calls.syncLocalData[0][2][0]).toMatchObject({
      clientId: "p1",
      deleted: true,
    });
  });

  it("keeps a track queued when registration fails", async () => {
    const { store, tracks } = createStore({ tracks: [track()] });
    const { transport } = createTransport({
      registerTrack: async () => {
        throw new Error("offline");
      },
    });

    const summary = await runSync({ store, transport });

    expect(summary.failed).toBe(1);
    expect(tracks.get("t1")?.syncStatus).toBe("failed");
  });
});
