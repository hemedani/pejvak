import type {
  LocalAnnotation,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  SyncStatus,
} from "@/lib/db/types";

export type RegisterTrackResult = { _id?: string };

export type SyncLocalDataResult = {
  syncedSessions?: number;
  syncedAnnotations?: number;
  syncedPlaylists?: number;
  annotations?: { clientId: string; serverId?: string }[];
  playlists?: { clientId: string; serverId?: string }[];
};

/** A playlist ready for the wire: item track ids replaced by content hashes. */
export type PlaylistSyncPayload = {
  clientId: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  items: { contentHash: string; order: number }[];
  updatedAt: number;
  deleted: boolean;
};

export type SyncTransport = {
  registerTrack: (track: LocalTrack) => Promise<RegisterTrackResult>;
  syncLocalData: (
    sessions: LocalSession[],
    annotations: LocalAnnotation[],
    playlists: PlaylistSyncPayload[],
  ) => Promise<SyncLocalDataResult>;
};

export type SyncStore = {
  getPendingTracks: (limit: number) => Promise<LocalTrack[]>;
  getAllTracks: () => Promise<LocalTrack[]>;
  getPendingSessions: (limit: number) => Promise<LocalSession[]>;
  getPendingAnnotations: (limit: number) => Promise<LocalAnnotation[]>;
  getPendingPlaylists: (limit: number) => Promise<LocalPlaylist[]>;
  setTrackSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  setSessionSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  setAnnotationSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  setPlaylistSyncStatus: (id: string, status: SyncStatus, serverId?: string) => Promise<void>;
  /** Hard-delete a row (used for acknowledged delete tombstones). */
  removeAnnotation: (id: string) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
};

export type SyncSummary = {
  tracksRegistered: number;
  sessionsSynced: number;
  annotationsSynced: number;
  playlistsSynced: number;
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
    playlistsSynced: 0,
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

  // Only send rows whose track now exists server-side; the backend skips
  // unknown content hashes.
  const allTracks = await store.getAllTracks();
  const syncedHashes = new Set(
    allTracks
      .filter((track) => track.syncStatus === "synced" || track.serverId !== null)
      .map((track) => track.contentHash),
  );
  const trackByLocalId = new Map(allTracks.map((track) => [track.id, track]));

  const sessions = (await store.getPendingSessions(limit)).filter(
    (session) => isFinalized(session) && syncedHashes.has(session.contentHash),
  );
  const annotations = (await store.getPendingAnnotations(limit)).filter((annotation) =>
    syncedHashes.has(annotation.contentHash),
  );

  // Playlists go last; defer any whose referenced tracks are not registered yet.
  const pendingPlaylists = await store.getPendingPlaylists(limit);
  const playlistPayloads: PlaylistSyncPayload[] = [];
  for (const playlist of pendingPlaylists) {
    if (playlist.deletedAt !== null) {
      playlistPayloads.push({
        clientId: playlist.id,
        title: playlist.title,
        description: playlist.description,
        isPublic: playlist.isPublic,
        items: [],
        updatedAt: playlist.deletedAt,
        deleted: true,
      });
      continue;
    }

    const items: { contentHash: string; order: number }[] = [];
    let resolvedAll = true;
    for (const item of playlist.items) {
      const track = trackByLocalId.get(item.trackId);
      if (!track || !syncedHashes.has(track.contentHash)) {
        resolvedAll = false;
        break;
      }
      items.push({ contentHash: track.contentHash, order: item.order });
    }
    if (!resolvedAll) {
      continue;
    }

    playlistPayloads.push({
      clientId: playlist.id,
      title: playlist.title,
      description: playlist.description,
      isPublic: playlist.isPublic,
      items,
      updatedAt: playlist.updatedAt,
      deleted: false,
    });
  }

  if (sessions.length === 0 && annotations.length === 0 && playlistPayloads.length === 0) {
    return summary;
  }

  await Promise.all([
    ...sessions.map((session) => store.setSessionSyncStatus(session.id, "syncing")),
    ...annotations.map((annotation) =>
      store.setAnnotationSyncStatus(annotation.id, "syncing"),
    ),
    ...playlistPayloads.map((playlist) =>
      store.setPlaylistSyncStatus(playlist.clientId, "syncing"),
    ),
  ]);

  try {
    const result = await transport.syncLocalData(sessions, annotations, playlistPayloads);
    const annotationServerIds = new Map(
      (result.annotations ?? []).map((mapping) => [mapping.clientId, mapping.serverId]),
    );
    const playlistServerIds = new Map(
      (result.playlists ?? []).map((mapping) => [mapping.clientId, mapping.serverId]),
    );
    await Promise.all([
      ...sessions.map((session) => store.setSessionSyncStatus(session.id, "synced")),
      ...annotations.map((annotation) =>
        annotation.deletedAt !== null
          ? store.removeAnnotation(annotation.id)
          : store.setAnnotationSyncStatus(
              annotation.id,
              "synced",
              annotationServerIds.get(annotation.id),
            ),
      ),
      ...playlistPayloads.map((playlist) =>
        playlist.deleted
          ? store.removePlaylist(playlist.clientId)
          : store.setPlaylistSyncStatus(
              playlist.clientId,
              "synced",
              playlistServerIds.get(playlist.clientId),
            ),
      ),
    ]);
    summary.sessionsSynced = result.syncedSessions ?? 0;
    summary.annotationsSynced = result.syncedAnnotations ?? 0;
    summary.playlistsSynced = result.syncedPlaylists ?? 0;
  } catch {
    await Promise.all([
      ...sessions.map((session) => store.setSessionSyncStatus(session.id, "failed")),
      ...annotations.map((annotation) =>
        store.setAnnotationSyncStatus(annotation.id, "failed"),
      ),
      ...playlistPayloads.map((playlist) =>
        store.setPlaylistSyncStatus(playlist.clientId, "failed"),
      ),
    ]);
    summary.failed += sessions.length + annotations.length + playlistPayloads.length;
  }

  return summary;
}
