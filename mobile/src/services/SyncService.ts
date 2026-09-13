import type { BackendActRequest } from "@/lib/backend-types";
import { callTypedAct } from "@/lib/client";
import type { LocalAnnotation, LocalSession, LocalTrack, SyncStatus } from "@/lib/db/types";
import {
  reconcileAnnotations,
  reconcilePlaylists,
  reconcileSessions,
  reconcileTracks,
  type RemoteAnnotation,
  type RemotePlaylist,
  type RemoteSession,
  type RemoteTrack,
} from "@/lib/reconcile";
import {
  runSync,
  type PlaylistSyncPayload,
  type RegisterTrackResult,
  type SyncLocalDataResult,
  type SyncStore,
  type SyncSummary,
  type SyncTransport,
} from "@/lib/syncEngine";
import { LocalDBService } from "@/services/LocalDBService";
import { SettingsService } from "@/services/SettingsService";

type RegisterTrackDetails = BackendActRequest<"main", "track", "registerTrack">["details"];
type SyncLocalDataDetails = BackendActRequest<"main", "track", "syncLocalData">["details"];

function registerTrack(track: LocalTrack): Promise<RegisterTrackResult> {
  const details: RegisterTrackDetails = {
    set: {
      title: track.title,
      contentHash: track.contentHash,
      durationSec: track.durationSec,
      fileSizeBytes: track.fileSizeBytes,
      isAudiobook: track.isAudiobook,
      ...(track.fileName ? { fileName: track.fileName } : {}),
      ...(track.mimeType ? { mimeType: track.mimeType } : {}),
      ...(track.author ? { author: track.author } : {}),
      ...(track.narrator ? { narrator: track.narrator } : {}),
      ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
    },
    get: { _id: 1, title: 1, contentHash: 1 },
  };
  return callTypedAct<"main", "track", "registerTrack", RegisterTrackResult>({
    service: "main",
    model: "track",
    act: "registerTrack",
    details,
  });
}

function syncLocalData(
  sessions: LocalSession[],
  annotations: LocalAnnotation[],
  playlists: PlaylistSyncPayload[],
): Promise<SyncLocalDataResult> {
  const details: SyncLocalDataDetails = {
    set: {
      playlists: playlists.map((playlist) => ({
        clientId: playlist.clientId,
        title: playlist.title,
        description: playlist.description ?? undefined,
        isPublic: playlist.isPublic,
        items: playlist.items,
        updatedAt: playlist.updatedAt,
        deleted: playlist.deleted,
      })),
      sessions: sessions.map((session) => ({
        clientId: session.id,
        contentHash: session.contentHash,
        startedAt: session.startedAt,
        startPositionSec: session.startPositionSec,
        endPositionSec: session.endPositionSec ?? session.startPositionSec,
        durationListenedSec: session.durationListenedSec,
        playbackSpeed: session.playbackSpeed,
        completed: session.completed,
        interrupted: session.interrupted,
        ...(session.endedAt !== null ? { endedAt: session.endedAt } : {}),
        ...(session.deviceInfo ? { deviceInfo: session.deviceInfo } : {}),
      })),
      annotations: annotations.map((annotation) => ({
        clientId: annotation.id,
        contentHash: annotation.contentHash,
        positionSec: annotation.positionSec,
        text: annotation.text,
        tags: annotation.tags,
        updatedAt: annotation.updatedAt,
        deleted: annotation.deletedAt !== null,
        ...(annotation.color ? { color: annotation.color } : {}),
      })),
    },
    get: {
      syncedSessions: 1,
      syncedAnnotations: 1,
      syncedPlaylists: 1,
      annotations: [],
      playlists: [],
    },
  };
  return callTypedAct<"main", "track", "syncLocalData", SyncLocalDataResult>({
    service: "main",
    model: "track",
    act: "syncLocalData",
    details,
  });
}

export const serverTransport: SyncTransport = { registerTrack, syncLocalData };

export const localStore: SyncStore = {
  getPendingTracks: (limit) => LocalDBService.getPendingTracks(limit),
  getAllTracks: () => LocalDBService.getAllTracks(),
  getPendingSessions: (limit) => LocalDBService.getPendingSessions(limit),
  getPendingAnnotations: (limit) => LocalDBService.getPendingAnnotations(limit),
  getPendingPlaylists: (limit) => LocalDBService.getPendingPlaylists(limit),
  setTrackSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setTrackSyncStatus(id, status, serverId),
  setSessionSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setSessionSyncStatus(id, status, serverId),
  setAnnotationSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setAnnotationSyncStatus(id, status, serverId),
  setPlaylistSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setPlaylistSyncStatus(id, status, serverId),
  removeAnnotation: (id: string) => LocalDBService.hardDeleteAnnotation(id),
  removePlaylist: (id: string) => LocalDBService.deletePlaylist(id),
};

/** Push all pending local rows to the backend. Never throws for sync errors. */
export function syncPending(batchSize?: number): Promise<SyncSummary> {
  return runSync({ store: localStore, transport: serverTransport, batchSize });
}

// --- Pull / restore -------------------------------------------------------

const PULL_PAGE_SIZE = 500;

type RemoteTrackRow = {
  _id?: string;
  contentHash?: string;
  title?: string;
  durationSec?: number;
  fileSizeBytes?: number;
  isAudiobook?: boolean;
  author?: string;
  narrator?: string;
};

type RemoteSessionRow = {
  _id?: string;
  clientId?: string;
  contentHash?: string;
  startedAt?: number;
  endedAt?: number;
  startPositionSec?: number;
  endPositionSec?: number;
  durationListenedSec?: number;
  playbackSpeed?: number;
  completed?: boolean;
  interrupted?: boolean;
  track?: { contentHash?: string };
};

type RemoteAnnotationRow = {
  _id?: string;
  clientId?: string;
  positionSec?: number;
  text?: string;
  tags?: string[];
  color?: string;
  updatedAt?: string | number;
  track?: { contentHash?: string };
};

type RemotePlaylistRow = {
  _id?: string;
  clientId?: string;
  title?: string;
  description?: string;
  isPublic?: boolean;
  items?: { trackId?: string; order?: number }[];
  updatedAt?: string | number;
};

function toMillis(value: string | number | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  return value ? new Date(value).getTime() : Date.now();
}

async function fetchRemoteTracks(): Promise<RemoteTrack[]> {
  const details: BackendActRequest<"main", "track", "getMyTracks">["details"] = {
    set: { page: 1, limit: PULL_PAGE_SIZE },
    get: {
      _id: 1,
      contentHash: 1,
      title: 1,
      durationSec: 1,
      fileSizeBytes: 1,
      isAudiobook: 1,
      author: 1,
      narrator: 1,
    },
  };
  const rows = await callTypedAct<"main", "track", "getMyTracks", RemoteTrackRow[]>({
    service: "main",
    model: "track",
    act: "getMyTracks",
    details,
  });
  return rows.flatMap((row) =>
    row._id && row.contentHash && row.title
      ? [
          {
            serverId: row._id,
            contentHash: row.contentHash,
            title: row.title,
            durationSec: row.durationSec ?? 0,
            fileSizeBytes: row.fileSizeBytes ?? 0,
            isAudiobook: row.isAudiobook ?? false,
            author: row.author ?? null,
            narrator: row.narrator ?? null,
          },
        ]
      : [],
  );
}

async function fetchRemoteSessions(): Promise<RemoteSession[]> {
  const details: BackendActRequest<"main", "playbackSession", "getMyListeningHistory">["details"] =
    {
      set: { page: 1, limit: PULL_PAGE_SIZE },
      get: {
        _id: 1,
        clientId: 1,
        contentHash: 1,
        startedAt: 1,
        endedAt: 1,
        startPositionSec: 1,
        endPositionSec: 1,
        durationListenedSec: 1,
        playbackSpeed: 1,
        completed: 1,
        interrupted: 1,
        track: { contentHash: 1 },
      },
    };
  const rows = await callTypedAct<
    "main",
    "playbackSession",
    "getMyListeningHistory",
    RemoteSessionRow[]
  >({
    service: "main",
    model: "playbackSession",
    act: "getMyListeningHistory",
    details,
  });
  return rows.flatMap((row) => {
    const contentHash = row.contentHash ?? row.track?.contentHash;
    if (!row._id || !contentHash || row.startedAt === undefined) {
      return [];
    }
    return [
      {
        serverId: row._id,
        clientId: row.clientId ?? null,
        contentHash,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? null,
        startPositionSec: row.startPositionSec ?? 0,
        endPositionSec: row.endPositionSec ?? null,
        durationListenedSec: row.durationListenedSec ?? 0,
        playbackSpeed: row.playbackSpeed ?? 1,
        completed: row.completed ?? false,
        interrupted: row.interrupted ?? false,
      },
    ];
  });
}

async function fetchRemoteAnnotations(): Promise<RemoteAnnotation[]> {
  const details: BackendActRequest<"main", "annotation", "getMyAnnotations">["details"] = {
    set: { page: 1, limit: PULL_PAGE_SIZE },
    get: {
      _id: 1,
      clientId: 1,
      positionSec: 1,
      text: 1,
      tags: 1,
      color: 1,
      updatedAt: 1,
      track: { contentHash: 1 },
    },
  };
  const rows = await callTypedAct<
    "main",
    "annotation",
    "getMyAnnotations",
    RemoteAnnotationRow[]
  >({
    service: "main",
    model: "annotation",
    act: "getMyAnnotations",
    details,
  });
  return rows.flatMap((row) => {
    const contentHash = row.track?.contentHash;
    if (!row._id || !contentHash || row.positionSec === undefined) {
      return [];
    }
    return [
      {
        serverId: row._id,
        clientId: row.clientId ?? null,
        contentHash,
        positionSec: row.positionSec,
        text: row.text ?? "",
        tags: row.tags ?? [],
        color: row.color ?? null,
        updatedAt: toMillis(row.updatedAt),
      },
    ];
  });
}

async function fetchRemotePlaylists(): Promise<RemotePlaylistRow[]> {
  const details: BackendActRequest<"main", "playlist", "getMyPlaylists">["details"] = {
    set: { page: 1, limit: PULL_PAGE_SIZE },
    get: {
      _id: 1,
      clientId: 1,
      title: 1,
      description: 1,
      isPublic: 1,
      items: 1,
      updatedAt: 1,
    },
  };
  return await callTypedAct<
    "main",
    "playlist",
    "getMyPlaylists",
    RemotePlaylistRow[]
  >({
    service: "main",
    model: "playlist",
    act: "getMyPlaylists",
    details,
  });
}

export type PullSummary = {
  tracks: number;
  sessions: number;
  annotations: number;
  playlists: number;
};

/**
 * Restores server-side data into SQLite so a reinstall / second device keeps
 * history and annotations. Tracks are matched by `contentHash`; sessions and
 * annotations by `clientId`. Best-effort: throws only if a fetch fails.
 */
export async function pullFromServer(): Promise<PullSummary> {
  const [remoteTracks, remoteSessions, remoteAnnotations, remotePlaylists] =
    await Promise.all([
      fetchRemoteTracks(),
      fetchRemoteSessions(),
      fetchRemoteAnnotations(),
      fetchRemotePlaylists(),
    ]);

  const trackPlan = reconcileTracks(await LocalDBService.getAllTracks(), remoteTracks);
  for (const item of trackPlan.inserts) {
    const local = await LocalDBService.insertTrack({
      contentHash: item.contentHash,
      title: item.title,
      durationSec: item.durationSec,
      fileSizeBytes: item.fileSizeBytes,
      isAudiobook: item.isAudiobook,
      author: item.author,
      narrator: item.narrator,
    });
    await LocalDBService.setTrackSyncStatus(local.id, "synced", item.serverId);
  }
  for (const item of trackPlan.backfill) {
    await LocalDBService.setTrackSyncStatus(item.id, "synced", item.serverId);
  }

  const sessionPlan = reconcileSessions(await LocalDBService.getAllSessions(), remoteSessions);
  for (const item of sessionPlan.inserts) {
    await LocalDBService.insertRemoteSession(item);
  }
  for (const item of sessionPlan.backfill) {
    await LocalDBService.setSessionSyncStatus(item.id, "synced", item.serverId);
  }

  const annotationPlan = reconcileAnnotations(
    await LocalDBService.getAllAnnotations(),
    remoteAnnotations,
  );
  for (const item of annotationPlan.inserts) {
    await LocalDBService.insertRemoteAnnotation(item);
  }
  for (const item of annotationPlan.updates) {
    await LocalDBService.applyRemoteAnnotationUpdate(item);
  }
  for (const item of annotationPlan.backfill) {
    await LocalDBService.setAnnotationSyncStatus(item.id, "synced", item.serverId);
  }

  // Playlist items carry server track ids; resolve them to local track ids.
  const tracksById = new Map(
    (await LocalDBService.getAllTracks())
      .filter((track) => track.serverId !== null)
      .map((track) => [track.serverId as string, track.id]),
  );
  const resolvedPlaylists: RemotePlaylist[] = remotePlaylists.flatMap((row) => {
    if (!row._id || !row.title) {
      return [];
    }
    const items = (row.items ?? []).flatMap((item) => {
      const trackId = item.trackId ? tracksById.get(item.trackId) : undefined;
      return trackId !== undefined && item.order !== undefined
        ? [{ trackId, order: item.order }]
        : [];
    });
    return [
      {
        serverId: row._id,
        clientId: row.clientId ?? null,
        title: row.title,
        description: row.description ?? null,
        isPublic: row.isPublic ?? false,
        items,
        updatedAt: toMillis(row.updatedAt),
      },
    ];
  });

  const playlistPlan = reconcilePlaylists(
    await LocalDBService.getAllPlaylists(),
    resolvedPlaylists,
  );
  for (const item of playlistPlan.inserts) {
    await LocalDBService.insertRemotePlaylist({
      id: item.clientId ?? item.serverId,
      serverId: item.serverId,
      title: item.title,
      description: item.description,
      isPublic: item.isPublic,
      items: item.items,
      updatedAt: item.updatedAt,
    });
  }
  for (const item of playlistPlan.updates) {
    await LocalDBService.applyRemotePlaylistUpdate(item);
  }
  for (const item of playlistPlan.backfill) {
    await LocalDBService.setPlaylistSyncStatus(item.id, "synced", item.serverId);
  }

  return {
    tracks: trackPlan.inserts.length,
    sessions: sessionPlan.inserts.length,
    annotations:
      annotationPlan.inserts.length + annotationPlan.updates.length,
    playlists: playlistPlan.inserts.length + playlistPlan.updates.length,
  };
}

/** Push pending local rows, then pull server state. Pull failures never throw. */
export async function syncAll(batchSize?: number): Promise<SyncSummary> {
  const summary = await syncPending(batchSize);
  try {
    await pullFromServer();
    await SettingsService.setLastSyncAt(Date.now());
  } catch {
    // Best-effort: the app stays usable; the next trigger retries.
  }
  return summary;
}
