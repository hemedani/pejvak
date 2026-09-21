import type {
  ContextType,
  LocalAnnotation,
  LocalContextPlay,
  LocalFolder,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaybackCheckpoint,
  PlaylistItem,
  SyncStatus,
  TrackAvailability,
  TrackSource,
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
  source: string | null;
  source_uri: string | null;
  source_path: string | null;
  source_size: number | null;
  source_mtime: number | null;
  folder_key: string | null;
  folder_name: string | null;
  album: string | null;
  track_number: number | null;
  disc_number: number | null;
  year: number | null;
  availability: string;
};

export type FolderRow = {
  key: string;
  name: string;
  tree_uri: string | null;
  added_at: number;
  last_played_at: number | null;
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
  context_play_id: string | null;
  context_type: string | null;
  context_key: string | null;
  /** Nullable only for a row written before the v10 backfill ran. */
  stretch_id: string | null;
  seeked: number;
};

export type ContextPlayRow = {
  id: string;
  server_id: string | null;
  context_type: string;
  context_key: string;
  context_title: string;
  track_count: number;
  started_at: number;
  ended_at: number | null;
  last_index: number;
  last_track_id: string | null;
  last_position_sec: number;
  listened_sec: number;
  finished_count: number;
  completed: number;
  interrupted: number;
  deleted_at: number | null;
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
  track_artwork_url: string | null;
  /**
   * Denormalised from the session's run. Null when the session was a track
   * played on its own — the History card has nothing to say about a collection
   * that was never involved.
   */
  context_title: string | null;
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
  context_play_id: string | null;
  /** Nullable only for a checkpoint written before the v10 backfill. */
  stretch_id: string | null;
};

const SYNC_STATUSES: readonly SyncStatus[] = ["pending", "syncing", "synced", "failed"];
const TRACK_SOURCES: readonly TrackSource[] = ["mediastore", "saf", "picker"];
const CONTEXT_TYPES: readonly ContextType[] = ["playlist", "folder"];

export function toSyncStatus(value: string): SyncStatus {
  return (SYNC_STATUSES as readonly string[]).includes(value)
    ? (value as SyncStatus)
    : "pending";
}

/**
 * An unrecognised context type reads as `null`, not as a default. A session
 * whose run cannot be classified belongs to no collection — guessing
 * "playlist" would put it in a list it was never part of.
 */
export function toContextType(value: string | null): ContextType | null {
  if (value === null) {
    return null;
  }
  return (CONTEXT_TYPES as readonly string[]).includes(value)
    ? (value as ContextType)
    : null;
}

/** Rows imported before device scanning existed have a null source, not a bogus one. */
export function toTrackSource(value: string | null): TrackSource | null {
  if (value === null) {
    return null;
  }
  return (TRACK_SOURCES as readonly string[]).includes(value) ? (value as TrackSource) : null;
}

export function toTrackAvailability(value: string): TrackAvailability {
  return value === "missing" ? "missing" : "present";
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
    source: toTrackSource(row.source),
    sourceUri: row.source_uri,
    sourcePath: row.source_path,
    sourceSize: row.source_size,
    sourceMtime: row.source_mtime,
    folderKey: row.folder_key,
    folderName: row.folder_name,
    album: row.album,
    trackNumber: row.track_number,
    discNumber: row.disc_number,
    year: row.year,
    availability: toTrackAvailability(row.availability),
  };
}

export function mapFolder(row: FolderRow): LocalFolder {
  return {
    key: row.key,
    name: row.name,
    treeUri: row.tree_uri,
    addedAt: row.added_at,
    lastPlayedAt: row.last_played_at,
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
    contextPlayId: row.context_play_id,
    contextType: toContextType(row.context_type),
    contextKey: row.context_key,
    // A row written before v10 has no group; being its own stretch is the
    // truthful reading of it, and matches what the migration backfilled.
    stretchId: row.stretch_id ?? row.id,
    seeked: toBoolean(row.seeked),
  };
}

export function mapContextPlay(row: ContextPlayRow): LocalContextPlay {
  return {
    id: row.id,
    serverId: row.server_id,
    // A run with an unreadable type is not a run anyone can act on; `folder` is
    // the fallback that at least resolves to a real screen rather than to a
    // playlist id that will never match.
    contextType: toContextType(row.context_type) ?? "folder",
    contextKey: row.context_key,
    contextTitle: row.context_title,
    trackCount: row.track_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastIndex: row.last_index,
    lastTrackId: row.last_track_id,
    lastPositionSec: row.last_position_sec,
    listenedSec: row.listened_sec,
    finishedCount: row.finished_count,
    completed: toBoolean(row.completed),
    interrupted: toBoolean(row.interrupted),
    deletedAt: row.deleted_at,
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
    contextPlayId: row.context_play_id,
    stretchId: row.stretch_id,
  };
}
