import type {
  LocalAnnotation,
  LocalSession,
  LocalTrack,
  SyncStatus,
} from "@/lib/db/types";

export type RegisterTrackResult = { _id?: string };

export type SyncLocalDataResult = {
  syncedSessions: number;
  syncedAnnotations: number;
};

export type SyncTransport = {
  registerTrack: (track: LocalTrack) => Promise<RegisterTrackResult>;
  syncLocalData: (
    sessions: LocalSession[],
    annotations: LocalAnnotation[],
  ) => Promise<SyncLocalDataResult>;
};

export type SyncStore = {
  getPendingTracks: (limit: number) => Promise<LocalTrack[]>;
  getAllTracks: () => Promise<LocalTrack[]>;
  getPendingSessions: (limit: number) => Promise<LocalSession[]>;
  getPendingAnnotations: (limit: number) => Promise<LocalAnnotation[]>;
  setTrackSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  setSessionSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  setAnnotationSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
};

export type SyncSummary = {
  tracksRegistered: number;
  sessionsSynced: number;
  annotationsSynced: number;
  failed: number;
};

export type SyncOptions = {
  store: SyncStore;
  transport: SyncTransport;
  batchSize?: number;
};

const DEFAULT_BATCH_SIZE = 50;

function isFinalized(session: LocalSession): boolean {
  return session.endedAt !== null;
}

/**
 * Pushes local state to the server:
 *   1. register any pending tracks (so sessions have a server-side parent),
 *   2. batch finalized pending sessions + pending annotations to `syncLocalData`.
 *
 * Rows move `pending -> syncing -> synced`, or `pending -> failed` and stay
 * queued for the next run. `syncLocalData` is idempotent on `clientId`, so a
 * retry after a dropped response cannot double-insert.
 */
export async function runSync(options: SyncOptions): Promise<SyncSummary> {
  const { store, transport } = options;
  const limit = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const summary: SyncSummary = {
    tracksRegistered: 0,
    sessionsSynced: 0,
    annotationsSynced: 0,
    failed: 0,
  };

  const pendingTracks = await store.getPendingTracks(limit);
  for (const track of pendingTracks) {
    await store.setTrackSyncStatus(track.id, "syncing");
    try {
      const created = await transport.registerTrack(track);
      await store.setTrackSyncStatus(track.id, "synced", created._id);
      summary.tracksRegistered += 1;
    } catch {
      await store.setTrackSyncStatus(track.id, "failed");
      summary.failed += 1;
    }
  }

  // Only send sessions/annotations whose track now exists server-side; the
  // backend skips unknown content hashes.
  const syncedHashes = new Set(
    (await store.getAllTracks())
      .filter((track) => track.syncStatus === "synced" || track.serverId !== null)
      .map((track) => track.contentHash),
  );

  const sessions = (await store.getPendingSessions(limit)).filter(
    (session) => isFinalized(session) && syncedHashes.has(session.contentHash),
  );
  const annotations = (await store.getPendingAnnotations(limit)).filter((annotation) =>
    syncedHashes.has(annotation.contentHash),
  );

  if (sessions.length === 0 && annotations.length === 0) {
    return summary;
  }

  await Promise.all([
    ...sessions.map((session) => store.setSessionSyncStatus(session.id, "syncing")),
    ...annotations.map((annotation) =>
      store.setAnnotationSyncStatus(annotation.id, "syncing"),
    ),
  ]);

  try {
    const result = await transport.syncLocalData(sessions, annotations);
    await Promise.all([
      ...sessions.map((session) => store.setSessionSyncStatus(session.id, "synced")),
      ...annotations.map((annotation) =>
        store.setAnnotationSyncStatus(annotation.id, "synced"),
      ),
    ]);
    summary.sessionsSynced = result.syncedSessions;
    summary.annotationsSynced = result.syncedAnnotations;
  } catch {
    await Promise.all([
      ...sessions.map((session) => store.setSessionSyncStatus(session.id, "failed")),
      ...annotations.map((annotation) =>
        store.setAnnotationSyncStatus(annotation.id, "failed"),
      ),
    ]);
    summary.failed += sessions.length + annotations.length;
  }

  return summary;
}
