import type {
  LocalAnnotation,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaybackCheckpoint,
  PlaylistItem,
  SyncStatus,
} from "@/lib/db/types";

export type TrackRow = {
  id: string;
  server_id: string | null;
  content_hash: string;
  title: string;
  file_name: string | null;
  file_uri: string | null;
  duration_sec: number;
  file_size_bytes: number;
  mime_type: string | null;
  is_audiobook: number;
  author: string | null;
  narrator: string | null;
  artwork_url: string | null;
  total_play_count: number;
  total_listen_time_sec: number;
  last_played_at: number | null;
  sync_status: string;
  created_at: number;
  updated_at: number;
};

export type SessionRow = {
  id: string;
  server_id: string | null;
  track_id: string;
  content_hash: string;
  started_at: number;
  ended_at: number | null;
  start_position_sec: number;
  end_position_sec: number | null;
  duration_listened_sec: number;
  playback_speed: number;
  completed: number;
  interrupted: number;
  device_info: string | null;
  sync_status: string;
  created_at: number;
  updated_at: number;
};

export type AnnotationRow = {
  id: string;
  server_id: string | null;
  track_id: string;
  content_hash: string;
  position_sec: number;
  text: string;
  tags: string;
  color: string | null;
  times_played_before: number;
  deleted_at: number | null;
  sync_status: string;
  created_at: number;
  updated_at: number;
};

/** A session row joined with the track columns the history card needs. */
export type HistoryRow = SessionRow & {
  track_title: string;
  track_author: string | null;
  track_content_hash: string;
  /** SQLite has no boolean type; 0 or 1. */
  track_is_audiobook: number;
};

export type PlaylistRow = {
  id: string;
  server_id: string | null;
  title: string;
  description: string | null;
  is_public: number;
  items: string;
  deleted_at: number | null;
  sync_status: string;
  created_at: number;
  updated_at: number;
};

export type CheckpointRow = {
  id: string;
  session_id: string;
  track_id: string;
  content_hash: string;
  position_sec: number;
  last_position_sec: number;
  duration_listened_sec: number;
  playback_speed: number;
  started_at: number;
  timestamp: number;
  device_info: string | null;
};

const SYNC_STATUSES: readonly SyncStatus[] = ["pending", "syncing", "synced", "failed"];

export function toSyncStatus(value: string): SyncStatus {
  return (SYNC_STATUSES as readonly string[]).includes(value)
    ? (value as SyncStatus)
    : "pending";
}

export function toBoolean(value: number): boolean {
  return value === 1;
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // fall through to empty
  }
  return [];
}

export function parsePlaylistItems(value: string): PlaylistItem[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is PlaylistItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as PlaylistItem).trackId === "string" &&
          typeof (item as PlaylistItem).order === "number",
      );
    }
  } catch {
    // fall through to empty
  }
  return [];
}

export function mapTrack(row: TrackRow): LocalTrack {
  return {
    id: row.id,
    serverId: row.server_id,
    contentHash: row.content_hash,
    title: row.title,
    fileName: row.file_name,
    fileUri: row.file_uri,
    durationSec: row.duration_sec,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    isAudiobook: toBoolean(row.is_audiobook),
    author: row.author,
    narrator: row.narrator,
    artworkUrl: row.artwork_url,
    totalPlayCount: row.total_play_count,
    totalListenTimeSec: row.total_listen_time_sec,
    lastPlayedAt: row.last_played_at,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSession(row: SessionRow): LocalSession {
  return {
    id: row.id,
    serverId: row.server_id,
    trackId: row.track_id,
    contentHash: row.content_hash,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startPositionSec: row.start_position_sec,
    endPositionSec: row.end_position_sec,
    durationListenedSec: row.duration_listened_sec,
    playbackSpeed: row.playback_speed,
    completed: toBoolean(row.completed),
    interrupted: toBoolean(row.interrupted),
    deviceInfo: row.device_info,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAnnotation(row: AnnotationRow): LocalAnnotation {
  return {
    id: row.id,
    serverId: row.server_id,
    trackId: row.track_id,
    contentHash: row.content_hash,
    positionSec: row.position_sec,
    text: row.text,
    tags: parseJsonArray(row.tags),
    color: row.color,
    timesPlayedBefore: row.times_played_before,
    deletedAt: row.deleted_at,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlaylist(row: PlaylistRow): LocalPlaylist {
  return {
    id: row.id,
    serverId: row.server_id,
    title: row.title,
    description: row.description,
    isPublic: toBoolean(row.is_public),
    items: parsePlaylistItems(row.items),
    deletedAt: row.deleted_at,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCheckpoint(row: CheckpointRow): PlaybackCheckpoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    trackId: row.track_id,
    contentHash: row.content_hash,
    positionSec: row.position_sec,
    lastPositionSec: row.last_position_sec,
    durationListenedSec: row.duration_listened_sec,
    playbackSpeed: row.playback_speed,
    startedAt: row.started_at,
    timestamp: row.timestamp,
    deviceInfo: row.device_info,
  };
}
