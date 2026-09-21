import type {
  LocalAnnotation,
  LocalContextPlay,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  SyncStatus,
} from "@/lib/db/types";
import { callTypedAct } from "@/lib/client";
import { LocalDBService } from "@/services/LocalDBService";
import { SettingsService } from "@/services/SettingsService";
import { pullFromServer, syncAll, syncPending } from "@/services/SyncService";

jest.mock("@/lib/client", () => ({ callTypedAct: jest.fn() }));

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getPendingTracks: jest.fn(),
    getAllTracks: jest.fn(),
    getPendingSessions: jest.fn(),
    getAllSessions: jest.fn(),
    getPendingAnnotations: jest.fn(),
    getAllAnnotations: jest.fn(),
    getPendingPlaylists: jest.fn(),
    getAllPlaylists: jest.fn(),
    getPendingContextPlays: jest.fn(),
    getAllContextPlays: jest.fn(),
    insertRemoteContextPlay: jest.fn(),
    insertRemoteSession: jest.fn(),
    setTrackSyncStatus: jest.fn(),
    setSessionSyncStatus: jest.fn(),
    setAnnotationSyncStatus: jest.fn(),
    setPlaylistSyncStatus: jest.fn(),
    setContextPlaySyncStatus: jest.fn(),
    hardDeleteAnnotation: jest.fn(),
    deletePlaylist: jest.fn(),
    insertRemotePlaylist: jest.fn(),
    applyRemotePlaylistUpdate: jest.fn(),
  },
}));

jest.mock("@/services/SettingsService", () => ({
  SettingsService: { setLastSyncAt: jest.fn(() => Promise.resolve()) },
}));

type CapturedRequest = {
  act: string;
  model?: string;
  details?: { set?: Record<string, unknown> };
};

const callTypedActMock = jest.mocked(callTypedAct) as unknown as jest.Mock<
  Promise<unknown>,
  [CapturedRequest]
>;

const getPendingTracks = jest.mocked(LocalDBService.getPendingTracks);
const getAllTracks = jest.mocked(LocalDBService.getAllTracks);
const getPendingSessions = jest.mocked(LocalDBService.getPendingSessions);
const getAllSessions = jest.mocked(LocalDBService.getAllSessions);
const getPendingAnnotations = jest.mocked(LocalDBService.getPendingAnnotations);
const getAllAnnotations = jest.mocked(LocalDBService.getAllAnnotations);
const getPendingPlaylists = jest.mocked(LocalDBService.getPendingPlaylists);
const getAllPlaylists = jest.mocked(LocalDBService.getAllPlaylists);
const getPendingContextPlays = jest.mocked(LocalDBService.getPendingContextPlays);
const getAllContextPlays = jest.mocked(LocalDBService.getAllContextPlays);
const setPlaylistSyncStatus = jest.mocked(LocalDBService.setPlaylistSyncStatus);
const setContextPlaySyncStatus = jest.mocked(LocalDBService.setContextPlaySyncStatus);
const deletePlaylist = jest.mocked(LocalDBService.deletePlaylist);
const insertRemoteSession = jest.mocked(LocalDBService.insertRemoteSession);
const setTrackSyncStatus = jest.mocked(LocalDBService.setTrackSyncStatus);
const setSessionSyncStatus = jest.mocked(LocalDBService.setSessionSyncStatus);
const setAnnotationSyncStatus = jest.mocked(LocalDBService.setAnnotationSyncStatus);
const hardDeleteAnnotation = jest.mocked(LocalDBService.hardDeleteAnnotation);
const setLastSyncAt = jest.mocked(SettingsService.setLastSyncAt);

type Row = { id: string; serverId: string | null; syncStatus: SyncStatus };

const db = {
  tracks: new Map<string, LocalTrack>(),
  sessions: new Map<string, LocalSession>(),
  annotations: new Map<string, LocalAnnotation>(),
  playlists: new Map<string, LocalPlaylist>(),
  contextPlays: new Map<string, LocalContextPlay>(),
};

function pending<T extends Row>(rows: Map<string, T>, limit: number): T[] {
  return [...rows.values()]
    .filter((row) => row.syncStatus === "pending" || row.syncStatus === "failed")
    .slice(0, limit);
}

let failSyncLocalData = false;

function installClient(): void {
  failSyncLocalData = false;
  callTypedActMock.mockImplementation(async (request) => {
    if (request.act === "registerTrack") {
      return { _id: `srv-${String(request.details?.set?.contentHash)}` };
    }
    if (request.act === "syncLocalData") {
      if (failSyncLocalData) {
        throw new Error("offline");
      }
      const sessions = (request.details?.set?.sessions as { clientId: string }[] | undefined) ?? [];
      const annotations =
        (request.details?.set?.annotations as { clientId: string }[] | undefined) ?? [];
      const playlists =
        (request.details?.set?.playlists as { clientId: string }[] | undefined) ?? [];
      const contextPlays =
        (request.details?.set?.contextPlays as { clientId: string }[] | undefined) ?? [];
      return {
        syncedSessions: sessions.length,
        syncedAnnotations: annotations.length,
        syncedPlaylists: playlists.length,
        syncedContextPlays: contextPlays.length,
        annotations: annotations.map((annotation) => ({
          clientId: annotation.clientId,
          serverId: `srv-${annotation.clientId}`,
        })),
        playlists: playlists.map((playlist) => ({
          clientId: playlist.clientId,
          serverId: `srv-${playlist.clientId}`,
        })),
        contextPlays: contextPlays.map((run) => ({
          clientId: run.clientId,
          serverId: `srv-${run.clientId}`,
        })),
      };
    }
    return [];
  });
}

function syncLocalDataPayloads(): {
  sessions: { clientId: string; endedAt?: number; stretchId?: string; seeked?: boolean }[];
  annotations: { clientId: string; deleted: boolean }[];
  playlists: {
    clientId: string;
    deleted: boolean;
    items: { contentHash: string; order: number }[];
  }[];
  contextPlays: { clientId: string }[];
}[] {
  return callTypedActMock.mock.calls
    .filter(([request]) => request.act === "syncLocalData")
    .map(([request]) => ({
      sessions:
        (request.details?.set?.sessions as {
          clientId: string;
          endedAt?: number;
          stretchId?: string;
          seeked?: boolean;
        }[]) ?? [],
      annotations:
        (request.details?.set?.annotations as { clientId: string; deleted: boolean }[]) ?? [],
      playlists:
        (request.details?.set?.playlists as {
          clientId: string;
          deleted: boolean;
          items: { contentHash: string; order: number }[];
        }[]) ?? [],
      contextPlays: (request.details?.set?.contextPlays as { clientId: string }[]) ?? [],
    }));
}

function registeredHashes(): string[] {
  return callTypedActMock.mock.calls
    .filter(([request]) => request.act === "registerTrack")
    .map(([request]) => String(request.details?.set?.contentHash));
}

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
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: overrides.stretchId ?? overrides.id ?? "s1",
    seeked: false,
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

function contextPlay(overrides: Partial<LocalContextPlay> = {}): LocalContextPlay {
  return {
    id: "r1",
    serverId: null,
    contextType: "folder",
    contextKey: "Lectures",
    contextTitle: "Lectures",
    trackCount: 24,
    startedAt: 100,
    endedAt: 200,
    lastIndex: 23,
    lastTrackId: "t1",
    lastPositionSec: 600,
    listenedSec: 5400,
    finishedCount: 24,
    completed: true,
    interrupted: false,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function setSyncStatus<T extends Row>(
  rows: Map<string, T>,
  id: string,
  status: SyncStatus,
  serverId?: string,
): void {
  const row = rows.get(id);
  if (row) {
    rows.set(id, { ...row, syncStatus: status, serverId: serverId ?? row.serverId });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  db.tracks.clear();
  db.sessions.clear();
  db.annotations.clear();
  db.playlists.clear();
  db.contextPlays.clear();
  installClient();

  getPendingTracks.mockImplementation(async (limit = 50) => pending(db.tracks, limit));
  getAllTracks.mockImplementation(async () => [...db.tracks.values()]);
  getPendingSessions.mockImplementation(async (limit = 50) => pending(db.sessions, limit));
  getAllSessions.mockImplementation(async () => [...db.sessions.values()]);
  getPendingAnnotations.mockImplementation(async (limit = 50) => pending(db.annotations, limit));
  getAllAnnotations.mockImplementation(async () => [...db.annotations.values()]);
  getPendingPlaylists.mockImplementation(async (limit = 50) => pending(db.playlists, limit));
  getAllPlaylists.mockImplementation(async () => [...db.playlists.values()]);
  getPendingContextPlays.mockImplementation(async (limit = 50) =>
    pending(db.contextPlays, limit),
  );
  getAllContextPlays.mockImplementation(async () => [...db.contextPlays.values()]);

  setTrackSyncStatus.mockImplementation(async (id, status, serverId) => {
    setSyncStatus(db.tracks, id, status, serverId);
  });
  setSessionSyncStatus.mockImplementation(async (id, status, serverId) => {
    setSyncStatus(db.sessions, id, status, serverId);
  });
  setAnnotationSyncStatus.mockImplementation(async (id, status, serverId) => {
    setSyncStatus(db.annotations, id, status, serverId);
  });
  setPlaylistSyncStatus.mockImplementation(async (id, status, serverId) => {
    setSyncStatus(db.playlists, id, status, serverId);
  });
  setContextPlaySyncStatus.mockImplementation(async (id, status, serverId) => {
    setSyncStatus(db.contextPlays, id, status, serverId);
  });
  hardDeleteAnnotation.mockImplementation(async (id) => {
    db.annotations.delete(id);
  });
  deletePlaylist.mockImplementation(async (id) => {
    db.playlists.delete(id);
  });
});

describe("syncPending", () => {
  it("registers a pending track then syncs its finalized session and annotation", async () => {
    db.tracks.set("t1", track());
    db.sessions.set("s1", session());
    db.annotations.set("a1", annotation());

    const summary = await syncPending();

    expect(summary).toEqual({
      tracksRegistered: 1,
      sessionsSynced: 1,
      annotationsSynced: 1,
      playlistsSynced: 0,
      contextPlaysSynced: 0,
      failed: 0,
    });
    expect(registeredHashes()).toEqual(["hash-1"]);
    expect(db.tracks.get("t1")).toMatchObject({ syncStatus: "synced", serverId: "srv-hash-1" });
    expect(db.sessions.get("s1")).toMatchObject({ syncStatus: "synced" });
    expect(db.annotations.get("a1")).toMatchObject({
      syncStatus: "synced",
      serverId: "srv-a1",
    });

    const [payload] = syncLocalDataPayloads();
    expect(payload.sessions).toEqual([
      expect.objectContaining({ clientId: "s1", endedAt: 220 }),
    ]);
    expect(payload.annotations).toEqual([
      expect.objectContaining({ clientId: "a1", deleted: false }),
    ]);
  });

  it("carries the listening stretch and the scrub flag with each session", async () => {
    db.tracks.set("t1", track());
    db.sessions.set("s1", session({ id: "s1", stretchId: "stretch-9", seeked: true }));

    await syncPending();

    const [payload] = syncLocalDataPayloads();
    expect(payload.sessions).toEqual([
      expect.objectContaining({ clientId: "s1", stretchId: "stretch-9", seeked: true }),
    ]);
  });

  it("sends a session's own id as its stretch when it has no group", async () => {
    // A row that was never part of a longer listen is a stretch of one, and the
    // other device has to be told that rather than left to guess.
    db.tracks.set("t1", track());
    db.sessions.set("s1", session({ id: "s1" }));

    await syncPending();

    const [payload] = syncLocalDataPayloads();
    expect(payload.sessions).toEqual([
      expect.objectContaining({ clientId: "s1", stretchId: "s1", seeked: false }),
    ]);
  });

  it("pushes a finished run and stores the server id it comes back with", async () => {
    db.contextPlays.set("r1", contextPlay());

    const summary = await syncPending();

    expect(summary.contextPlaysSynced).toBe(1);
    const [payload] = syncLocalDataPayloads();
    expect(payload.contextPlays).toEqual([
      expect.objectContaining({ clientId: "r1", contextKey: "Lectures" }),
    ]);
    expect(db.contextPlays.get("r1")).toMatchObject({
      syncStatus: "synced",
      serverId: "srv-r1",
    });
  });

  it("leaves a run that has not ended queued", async () => {
    // An in-progress run has no final figures: its listened time and its
    // finished count are still moving, so sending it would put a guess on the
    // server and then have to correct it.
    db.contextPlays.set("r1", contextPlay({ endedAt: null, completed: false }));

    const summary = await syncPending();

    expect(summary.contextPlaysSynced).toBe(0);
    // Nothing was worth sending, so the transport was never called at all.
    expect(syncLocalDataPayloads()).toEqual([]);
    expect(db.contextPlays.get("r1")?.syncStatus).toBe("pending");
  });

  it("only sends finalized sessions for a track that is already synced", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    db.sessions.set("open", session({ id: "open", endedAt: null, endPositionSec: null }));
    db.sessions.set("done", session({ id: "done" }));

    const summary = await syncPending();

    expect(summary.sessionsSynced).toBe(1);
    const [payload] = syncLocalDataPayloads();
    expect(payload.sessions.map((item) => item.clientId)).toEqual(["done"]);
    expect(db.sessions.get("open")?.syncStatus).toBe("pending");
    expect(registeredHashes()).toEqual([]);
  });

  it("keeps sessions queued while their track is still unregistered", async () => {
    db.tracks.set("t1", track());
    db.sessions.set("s1", session());
    callTypedActMock.mockImplementation(async (request) => {
      if (request.act === "registerTrack") {
        throw new Error("offline");
      }
      return [];
    });

    const summary = await syncPending();

    expect(summary.failed).toBe(1);
    expect(syncLocalDataPayloads()).toEqual([]);
    expect(db.tracks.get("t1")?.syncStatus).toBe("failed");
    expect(db.sessions.get("s1")?.syncStatus).toBe("pending");
  });

  it("retries a failed batch with the same client ids and never duplicates local rows", async () => {
    db.tracks.set("t1", track());
    db.sessions.set("s1", session());
    db.annotations.set("a1", annotation());

    failSyncLocalData = true;
    const failed = await syncPending();

    expect(failed.failed).toBe(2);
    expect(db.sessions.get("s1")?.syncStatus).toBe("failed");
    expect(db.annotations.get("a1")?.syncStatus).toBe("failed");
    expect(db.tracks.get("t1")?.syncStatus).toBe("synced");

    failSyncLocalData = false;
    const retried = await syncPending();

    expect(retried.failed).toBe(0);
    expect(retried.sessionsSynced).toBe(1);
    expect(retried.annotationsSynced).toBe(1);
    expect(registeredHashes()).toEqual(["hash-1"]);

    const payloads = syncLocalDataPayloads();
    expect(payloads).toHaveLength(2);
    expect(payloads[1].sessions.map((item) => item.clientId)).toEqual(["s1"]);
    expect(payloads[1].annotations.map((item) => item.clientId)).toEqual(["a1"]);
    expect(db.sessions.get("s1")).toMatchObject({ syncStatus: "synced" });
    expect(db.annotations.get("a1")).toMatchObject({
      syncStatus: "synced",
      serverId: "srv-a1",
    });
  });

  it("pushes a playlist, mapping items to content hashes and storing the server id", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    db.playlists.set("p1", playlist({ items: [{ trackId: "t1", order: 0 }] }));

    const summary = await syncPending();

    expect(summary.playlistsSynced).toBe(1);
    expect(db.playlists.get("p1")).toMatchObject({
      syncStatus: "synced",
      serverId: "srv-p1",
    });
    const [payload] = syncLocalDataPayloads();
    expect(payload.playlists).toEqual([
      expect.objectContaining({
        clientId: "p1",
        deleted: false,
        items: [{ contentHash: "hash-1", order: 0 }],
      }),
    ]);
  });

  it("hard-removes an acknowledged playlist delete tombstone", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    db.playlists.set("p1", playlist({ deletedAt: 5000 }));

    await syncPending();

    expect(db.playlists.has("p1")).toBe(false);
    const [payload] = syncLocalDataPayloads();
    expect(payload.playlists[0]).toMatchObject({ clientId: "p1", deleted: true });
  });

  it("hard-removes an acknowledged delete tombstone instead of marking it synced", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    db.annotations.set("a1", annotation({ deletedAt: 3000 }));

    await syncPending();

    expect(hardDeleteAnnotation).toHaveBeenCalledWith("a1");
    expect(db.annotations.has("a1")).toBe(false);
    expect(setAnnotationSyncStatus).not.toHaveBeenCalledWith("a1", "synced", expect.anything());
  });
});

describe("syncAll", () => {
  it("pushes, pulls, and records the last successful sync time", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));

    const summary = await syncAll();

    expect(summary.failed).toBe(0);
    expect(setLastSyncAt).toHaveBeenCalledTimes(1);
    expect(setLastSyncAt).toHaveBeenCalledWith(expect.any(Number));
  });

  it("resolves and skips the timestamp when the pull fails", async () => {
    callTypedActMock.mockImplementation(async (request) => {
      if (request.act === "registerTrack" || request.act === "syncLocalData") {
        return { _id: "srv-t1", syncedSessions: 0, syncedAnnotations: 0, annotations: [] };
      }
      throw new Error("offline");
    });

    await expect(syncAll()).resolves.toMatchObject({ failed: 0 });
    expect(setLastSyncAt).not.toHaveBeenCalled();
  });
});

describe("pullFromServer", () => {
  it("returns zero counts when the server has no data and is idempotent on re-pull", async () => {
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));

    const first = await pullFromServer();
    const second = await pullFromServer();

    expect(first).toEqual({
      tracks: 0,
      sessions: 0,
      annotations: 0,
      playlists: 0,
      contextPlays: 0,
    });
    expect(second).toEqual({
      tracks: 0,
      sessions: 0,
      annotations: 0,
      playlists: 0,
      contextPlays: 0,
    });
  });

  it("keeps a pulled session in the stretch the origin device gave it", async () => {
    // A listen split across two phones has to read as one entry on both, so the
    // grouping key travels with the session instead of being re-derived here.
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    callTypedActMock.mockImplementation(async (request) => {
      if (request.act === "getMyListeningHistory") {
        return [
          {
            _id: "srv-s1",
            clientId: "ls1",
            contentHash: "hash-1",
            startedAt: 10,
            endedAt: 70,
            startPositionSec: 0,
            endPositionSec: 60,
            durationListenedSec: 60,
            playbackSpeed: 1,
            completed: true,
            interrupted: false,
            stretchId: "stretch-9",
            seeked: true,
          },
        ];
      }
      return [];
    });

    const summary = await pullFromServer();

    expect(summary.sessions).toBe(1);
    expect(insertRemoteSession).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "ls1", stretchId: "stretch-9", seeked: true }),
    );
  });

  it("reads a pulled session the server had no group for as ungrouped", async () => {
    // Null, not a synthesised id: the local insert turns "no group" into a
    // stretch of one, and it cannot do that if the value is indistinguishable
    // from a real grouping key.
    db.tracks.set("t1", track({ syncStatus: "synced", serverId: "srv-t1" }));
    callTypedActMock.mockImplementation(async (request) => {
      if (request.act === "getMyListeningHistory") {
        return [
          {
            _id: "srv-s1",
            clientId: "ls1",
            contentHash: "hash-1",
            startedAt: 10,
            durationListenedSec: 0,
            playbackSpeed: 1,
          },
        ];
      }
      return [];
    });

    await pullFromServer();

    expect(insertRemoteSession).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "ls1", stretchId: null, seeked: false }),
    );
  });
});
