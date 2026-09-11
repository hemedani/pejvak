import type { BackendActRequest } from "@/lib/backend-types";
import { callTypedAct } from "@/lib/client";
import type { LocalAnnotation, LocalSession, LocalTrack, SyncStatus } from "@/lib/db/types";
import {
  runSync,
  type RegisterTrackResult,
  type SyncLocalDataResult,
  type SyncStore,
  type SyncSummary,
  type SyncTransport,
} from "@/lib/syncEngine";
import { LocalDBService } from "@/services/LocalDBService";

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
): Promise<SyncLocalDataResult> {
  const details: SyncLocalDataDetails = {
    set: {
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
    get: { syncedSessions: 1, syncedAnnotations: 1, annotations: [] },
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
  setTrackSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setTrackSyncStatus(id, status, serverId),
  setSessionSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setSessionSyncStatus(id, status, serverId),
  setAnnotationSyncStatus: (id: string, status: SyncStatus, serverId?: string) =>
    LocalDBService.setAnnotationSyncStatus(id, status, serverId),
  removeAnnotation: (id: string) => LocalDBService.hardDeleteAnnotation(id),
};

/** Push all pending local rows to the backend. Never throws for sync errors. */
export function syncPending(batchSize?: number): Promise<SyncSummary> {
  return runSync({ store: localStore, transport: serverTransport, batchSize });
}
