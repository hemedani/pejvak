import type {
  LocalAnnotation,
  LocalSession,
  LocalTrack,
  SyncStatus,
} from "@/lib/db/types";
import {
  runSync,
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
}) {
  const tracks = new Map((seed.tracks ?? []).map((item) => [item.id, item]));
  const sessions = new Map((seed.sessions ?? []).map((item) => [item.id, item]));
  const annotations = new Map((seed.annotations ?? []).map((item) => [item.id, item]));

  const pending = <T extends { syncStatus: SyncStatus }>(map: Map<string, T>, limit: number) =>
    [...map.values()]
      .filter((row) => row.syncStatus === "pending" || row.syncStatus === "failed")
      .slice(0, limit);

  const store: SyncStore = {
    getPendingTracks: async (limit) => pending(tracks, limit),
    getAllTracks: async () => [...tracks.values()],
    getPendingSessions: async (limit) => pending(sessions, limit),
    getPendingAnnotations: async (limit) => pending(annotations, limit),
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
  };

  return { store, tracks, sessions, annotations };
}

function createTransport(overrides: Partial<SyncTransport> = {}) {
  const calls: { registerTrack: LocalTrack[]; syncLocalData: [LocalSession[], LocalAnnotation[]][] } =
    { registerTrack: [], syncLocalData: [] };

  const transport: SyncTransport = {
    registerTrack:
      overrides.registerTrack ??
      (async (item) => {
        calls.registerTrack.push(item);
        return { _id: `server-${item.id}` };
      }),
    syncLocalData:
      overrides.syncLocalData ??
      (async (sessions, annotations) => {
        calls.syncLocalData.push([sessions, annotations]);
        return {
          syncedSessions: sessions.length,
          syncedAnnotations: annotations.length,
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
    expect(annotations.get("a1")?.syncStatus).toBe("synced");
    expect(calls.syncLocalData).toHaveLength(1);
    expect(calls.syncLocalData[0][0][0]).toMatchObject({ id: "s1", durationListenedSec: 60 });
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
