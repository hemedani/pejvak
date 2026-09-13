import * as Crypto from "expo-crypto";

import { getDatabase } from "@/lib/db/database";
import {
  mapAnnotation,
  mapCheckpoint,
  mapPlaylist,
  mapSession,
  mapTrack,
  type AnnotationRow,
  type CheckpointRow,
  type HistoryRow,
  type PlaylistRow,
  type SessionRow,
  type TrackRow,
} from "@/lib/db/mappers";
import type {
  CreateAnnotationInput,
  CreatePlaylistInput,
  CreateSessionInput,
  CreateTrackInput,
  FinalizeSessionInput,
  InsertRemotePlaylistInput,
  LocalAnnotation,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaybackCheckpoint,
  PlaylistItem,
  PendingCounts,
  SaveCheckpointInput,
  SyncStatus,
  TrackDetailData,
} from "@/lib/db/types";
import type { HistoryItem } from "@/lib/history";
import type {
  AnnotationUpdate,
  PlaylistUpdate,
  RemoteAnnotation,
  RemoteSession,
} from "@/lib/reconcile";

function newId(): string {
  return Crypto.randomUUID();
}

// --- Tracks ---------------------------------------------------------------

async function insertTrack(input: CreateTrackInput): Promise<LocalTrack> {
  const db = await getDatabase();
  const existing = await getTrackByContentHash(input.contentHash);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const track: LocalTrack = {
    id: input.id ?? newId(),
    serverId: null,
    contentHash: input.contentHash,
    title: input.title,
    fileName: input.fileName ?? null,
    fileUri: input.fileUri ?? null,
    durationSec: Math.round(input.durationSec),
    fileSizeBytes: input.fileSizeBytes,
    mimeType: input.mimeType ?? null,
    isAudiobook: input.isAudiobook ?? false,
    author: input.author ?? null,
    narrator: input.narrator ?? null,
    artworkUrl: input.artworkUrl ?? null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO tracks (
      id, server_id, content_hash, title, file_name, file_uri, duration_sec,
      file_size_bytes, mime_type, is_audiobook, author, narrator, artwork_url,
      total_play_count, total_listen_time_sec, last_played_at, sync_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      track.id,
      track.serverId,
      track.contentHash,
      track.title,
      track.fileName,
      track.fileUri,
      track.durationSec,
      track.fileSizeBytes,
      track.mimeType,
      track.isAudiobook ? 1 : 0,
      track.author,
      track.narrator,
      track.artworkUrl,
      track.totalPlayCount,
      track.totalListenTimeSec,
      track.lastPlayedAt,
      track.syncStatus,
      track.createdAt,
      track.updatedAt,
    ],
  );

  return track;
}

async function getTrackById(id: string): Promise<LocalTrack | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TrackRow>("SELECT * FROM tracks WHERE id = ?", [id]);
  return row ? mapTrack(row) : null;
}

async function getTrackByContentHash(contentHash: string): Promise<LocalTrack | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TrackRow>("SELECT * FROM tracks WHERE content_hash = ?", [
    contentHash,
  ]);
  return row ? mapTrack(row) : null;
}

/** Track plus its sessions and annotations, for the Track Detail screen. */
async function getTrackDetailData(trackId: string): Promise<TrackDetailData | null> {
  const track = await getTrackById(trackId);
  if (!track) {
    return null;
  }
  const [sessions, annotations] = await Promise.all([
    getSessionsByTrack(trackId),
    getAnnotationsByTrack(trackId),
  ]);
  return { track, sessions, annotations };
}

async function getAllTracks(): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    "SELECT * FROM tracks ORDER BY updated_at DESC",
  );
  return rows.map(mapTrack);
}

async function getPendingTracks(limit = 50): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT * FROM tracks
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapTrack);
}

async function setTrackSyncStatus(
  id: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE tracks
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE id = ?`,
    [status, serverId ?? null, Date.now(), id],
  );
}

// --- Sessions -------------------------------------------------------------

async function insertSession(input: CreateSessionInput): Promise<LocalSession> {
  const db = await getDatabase();
  const now = Date.now();
  const session: LocalSession = {
    id: input.id ?? newId(),
    serverId: null,
    trackId: input.trackId,
    contentHash: input.contentHash,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    startPositionSec: Math.round(input.startPositionSec),
    endPositionSec: input.endPositionSec ?? null,
    durationListenedSec: Math.round(input.durationListenedSec ?? 0),
    playbackSpeed: input.playbackSpeed,
    completed: input.completed ?? false,
    interrupted: input.interrupted ?? false,
    deviceInfo: input.deviceInfo ?? null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO sessions (
      id, server_id, track_id, content_hash, started_at, ended_at,
      start_position_sec, end_position_sec, duration_listened_sec, playback_speed,
      completed, interrupted, device_info, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.serverId,
      session.trackId,
      session.contentHash,
      session.startedAt,
      session.endedAt,
      session.startPositionSec,
      session.endPositionSec,
      session.durationListenedSec,
      session.playbackSpeed,
      session.completed ? 1 : 0,
      session.interrupted ? 1 : 0,
      session.deviceInfo,
      session.syncStatus,
      session.createdAt,
      session.updatedAt,
    ],
  );

  return session;
}

async function getSessionById(id: string): Promise<LocalSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
  return row ? mapSession(row) : null;
}

async function getSessionsByTrack(trackId: string): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM sessions WHERE track_id = ? ORDER BY started_at DESC",
    [trackId],
  );
  return rows.map(mapSession);
}

/** Newest-first session history joined with each track, for the History screen. */
async function getSessionsForHistory(limit = 200): Promise<HistoryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    `SELECT s.*, t.title AS track_title, t.author AS track_author,
            t.content_hash AS track_content_hash
     FROM sessions s
     JOIN tracks t ON t.id = s.track_id
     ORDER BY s.started_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    session: mapSession(row),
    track: {
      id: row.track_id,
      title: row.track_title,
      author: row.track_author,
      contentHash: row.track_content_hash,
    },
  }));
}

async function getPendingSessions(limit = 50): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapSession);
}

/** All local sessions (used by remote reconciliation). */
async function getAllSessions(): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>("SELECT * FROM sessions");
  return rows.map(mapSession);
}

/** Inserts a session pulled from the server, keeping its client/server ids. */
async function insertRemoteSession(input: RemoteSession): Promise<void> {
  const track = await getTrackByContentHash(input.contentHash);
  if (!track) {
    return;
  }
  const db = await getDatabase();
  const id = input.clientId ?? input.serverId;
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO sessions (
      id, server_id, track_id, content_hash, started_at, ended_at,
      start_position_sec, end_position_sec, duration_listened_sec, playback_speed,
      completed, interrupted, device_info, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)`,
    [
      id,
      input.serverId,
      track.id,
      input.contentHash,
      input.startedAt,
      input.endedAt,
      Math.round(input.startPositionSec),
      input.endPositionSec === null ? null : Math.round(input.endPositionSec),
      Math.round(input.durationListenedSec),
      input.playbackSpeed,
      input.completed ? 1 : 0,
      input.interrupted ? 1 : 0,
      null,
      now,
      now,
    ],
  );
}

/**
 * Sessions are append-only once finalized/synced: the guard keeps a finalized
 * row from being overwritten after it has been pushed to the server.
 */
async function finalizeSession(id: string, input: FinalizeSessionInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions
     SET ended_at = ?, end_position_sec = ?, duration_listened_sec = ?,
         completed = ?, interrupted = ?, updated_at = ?
     WHERE id = ? AND sync_status != 'synced'`,
    [
      input.endedAt,
      Math.round(input.endPositionSec),
      Math.round(input.durationListenedSec),
      input.completed ? 1 : 0,
      input.interrupted ? 1 : 0,
      Date.now(),
      id,
    ],
  );
}

async function setSessionSyncStatus(
  id: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE id = ?`,
    [status, serverId ?? null, Date.now(), id],
  );
}

// --- Annotations ----------------------------------------------------------

async function insertAnnotation(input: CreateAnnotationInput): Promise<LocalAnnotation> {
  const db = await getDatabase();
  const now = Date.now();
  const annotation: LocalAnnotation = {
    id: input.id ?? newId(),
    serverId: null,
    trackId: input.trackId,
    contentHash: input.contentHash,
    positionSec: Math.round(input.positionSec),
    text: input.text,
    tags: input.tags ?? [],
    color: input.color ?? null,
    timesPlayedBefore: input.timesPlayedBefore ?? 0,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO annotations (
      id, server_id, track_id, content_hash, position_sec, text, tags, color,
      times_played_before, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      annotation.id,
      annotation.serverId,
      annotation.trackId,
      annotation.contentHash,
      annotation.positionSec,
      annotation.text,
      JSON.stringify(annotation.tags),
      annotation.color,
      annotation.timesPlayedBefore,
      annotation.syncStatus,
      annotation.createdAt,
      annotation.updatedAt,
    ],
  );

  return annotation;
}

async function getAnnotationsByTrack(trackId: string): Promise<LocalAnnotation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AnnotationRow>(
    "SELECT * FROM annotations WHERE track_id = ? AND deleted_at IS NULL ORDER BY position_sec ASC",
    [trackId],
  );
  return rows.map(mapAnnotation);
}

/** Live annotation count per track id (excludes tombstoned rows). */
async function getAnnotationCounts(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ track_id: string; n: number }>(
    `SELECT track_id, COUNT(*) AS n
     FROM annotations
     WHERE deleted_at IS NULL
     GROUP BY track_id`,
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.track_id] = row.n;
  }
  return counts;
}

async function getAnnotationById(id: string): Promise<LocalAnnotation | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AnnotationRow>(
    "SELECT * FROM annotations WHERE id = ?",
    [id],
  );
  return row ? mapAnnotation(row) : null;
}

async function getPendingAnnotations(limit = 50): Promise<LocalAnnotation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AnnotationRow>(
    `SELECT * FROM annotations
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapAnnotation);
}

async function getAllAnnotations(): Promise<LocalAnnotation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AnnotationRow>("SELECT * FROM annotations");
  return rows.map(mapAnnotation);
}

/** Inserts an annotation pulled from the server, preserving `updatedAt` for LWW. */
async function insertRemoteAnnotation(input: RemoteAnnotation): Promise<void> {
  const track = await getTrackByContentHash(input.contentHash);
  if (!track) {
    return;
  }
  const db = await getDatabase();
  const id = input.clientId ?? input.serverId;
  await db.runAsync(
    `INSERT OR IGNORE INTO annotations (
      id, server_id, track_id, content_hash, position_sec, text, tags, color,
      times_played_before, deleted_at, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'synced', ?, ?)`,
    [
      id,
      input.serverId,
      track.id,
      input.contentHash,
      Math.round(input.positionSec),
      input.text,
      JSON.stringify(input.tags),
      input.color,
      input.updatedAt,
      input.updatedAt,
    ],
  );
}

/** Applies a server-won annotation edit (LWW) and links the server id. */
async function applyRemoteAnnotationUpdate(update: AnnotationUpdate): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE annotations
     SET text = ?, tags = ?, color = ?, server_id = ?, sync_status = 'synced', updated_at = ?
     WHERE id = ?`,
    [
      update.text,
      JSON.stringify(update.tags),
      update.color,
      update.serverId,
      update.updatedAt,
      update.id,
    ],
  );
}

async function updateAnnotation(
  id: string,
  changes: { text?: string; tags?: string[]; color?: string | null },
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = Date.now();
  await db.runAsync(
    `UPDATE annotations
     SET text = COALESCE(?, text),
         tags = COALESCE(?, tags),
         color = COALESCE(?, color),
         sync_status = 'pending',
         updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      changes.text ?? null,
      changes.tags ? JSON.stringify(changes.tags) : null,
      changes.color ?? null,
      updatedAt,
      id,
    ],
  );
}

/**
 * Tombstones a server-known annotation so the delete can be pushed later. The
 * row is hidden from reads but kept queued until the batch sync acknowledges it.
 */
async function softDeleteAnnotation(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE annotations
     SET deleted_at = ?, sync_status = 'pending', updated_at = ?
     WHERE id = ?`,
    [now, now, id],
  );
}

async function hardDeleteAnnotation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM annotations WHERE id = ?", [id]);
}

async function setAnnotationSyncStatus(
  id: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE annotations
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE id = ?`,
    [status, serverId ?? null, Date.now(), id],
  );
}

// --- Playlists ------------------------------------------------------------

async function insertPlaylist(input: CreatePlaylistInput): Promise<LocalPlaylist> {
  const db = await getDatabase();
  const now = Date.now();
  const playlist: LocalPlaylist = {
    id: input.id ?? newId(),
    serverId: null,
    title: input.title,
    description: input.description ?? null,
    isPublic: input.isPublic ?? false,
    items: input.items ?? [],
    deletedAt: null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO playlists (
      id, server_id, title, description, is_public, items, sync_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      playlist.id,
      playlist.serverId,
      playlist.title,
      playlist.description,
      playlist.isPublic ? 1 : 0,
      JSON.stringify(playlist.items),
      playlist.syncStatus,
      playlist.createdAt,
      playlist.updatedAt,
    ],
  );

  return playlist;
}

async function getPlaylists(): Promise<LocalPlaylist[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistRow>(
    "SELECT * FROM playlists WHERE deleted_at IS NULL ORDER BY updated_at DESC",
  );
  return rows.map(mapPlaylist);
}

async function getAllPlaylists(): Promise<LocalPlaylist[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistRow>("SELECT * FROM playlists");
  return rows.map(mapPlaylist);
}

async function getPlaylistById(id: string): Promise<LocalPlaylist | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PlaylistRow>(
    "SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return row ? mapPlaylist(row) : null;
}

async function getPendingPlaylists(limit = 50): Promise<LocalPlaylist[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistRow>(
    `SELECT * FROM playlists
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY updated_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapPlaylist);
}

async function updatePlaylist(
  id: string,
  changes: {
    title?: string;
    description?: string | null;
    isPublic?: boolean;
    items?: PlaylistItem[];
  },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE playlists
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         is_public = COALESCE(?, is_public),
         items = COALESCE(?, items),
         sync_status = 'pending',
         updated_at = ?
     WHERE id = ?`,
    [
      changes.title ?? null,
      changes.description ?? null,
      changes.isPublic === undefined ? null : changes.isPublic ? 1 : 0,
      changes.items ? JSON.stringify(changes.items) : null,
      Date.now(),
      id,
    ],
  );
}

/**
 * Tombstones a playlist so the delete can be pushed later. The row is hidden
 * from reads but kept queued until the batch sync acknowledges it.
 */
async function softDeletePlaylist(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE playlists
     SET deleted_at = ?, sync_status = 'pending', updated_at = ?
     WHERE id = ?`,
    [now, now, id],
  );
}

async function deletePlaylist(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM playlists WHERE id = ?", [id]);
}

/** Stores a playlist pulled from the server (already synced, items local). */
async function insertRemotePlaylist(input: InsertRemotePlaylistInput): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO playlists (
      id, server_id, title, description, is_public, items, deleted_at,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'synced', ?, ?)`,
    [
      input.id,
      input.serverId,
      input.title,
      input.description,
      input.isPublic ? 1 : 0,
      JSON.stringify(input.items),
      now,
      input.updatedAt,
    ],
  );
}

/** Applies a server-won playlist edit (LWW) and links the server id. */
async function applyRemotePlaylistUpdate(update: PlaylistUpdate): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE playlists
     SET title = ?, description = ?, is_public = ?, items = ?, server_id = ?,
         sync_status = 'synced', updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      update.title,
      update.description,
      update.isPublic ? 1 : 0,
      JSON.stringify(update.items),
      update.serverId,
      update.updatedAt,
      update.id,
    ],
  );
}

// --- Settings (key/value) -------------------------------------------------

async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value],
  );
}

/** Rows queued for sync, per table. Table names are constants, not user input. */
async function getPendingCounts(): Promise<PendingCounts> {
  const db = await getDatabase();
  const count = async (table: string): Promise<number> => {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE sync_status IN ('pending', 'failed')`,
    );
    return row?.n ?? 0;
  };
  return {
    tracks: await count("tracks"),
    sessions: await count("sessions"),
    annotations: await count("annotations"),
    playlists: await count("playlists"),
  };
}

async function setPlaylistSyncStatus(
  id: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE playlists
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE id = ?`,
    [status, serverId ?? null, Date.now(), id],
  );
}

// --- Playback checkpoints (local-only kill recovery) ----------------------

/** Upsert; one checkpoint per session (id === sessionId). */
async function saveCheckpoint(input: SaveCheckpointInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO playback_checkpoints (
      id, session_id, track_id, content_hash, position_sec, last_position_sec,
      duration_listened_sec, playback_speed, started_at, timestamp, device_info
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sessionId,
      input.sessionId,
      input.trackId,
      input.contentHash,
      Math.round(input.positionSec),
      Math.round(input.lastPositionSec),
      Math.round(input.durationListenedSec),
      input.playbackSpeed,
      input.startedAt,
      input.timestamp,
      input.deviceInfo ?? null,
    ],
  );
}

async function getCheckpointBySession(sessionId: string): Promise<PlaybackCheckpoint | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CheckpointRow>(
    "SELECT * FROM playback_checkpoints WHERE session_id = ?",
    [sessionId],
  );
  return row ? mapCheckpoint(row) : null;
}

/**
 * Checkpoints whose session was never closed: either the session row is missing
 * or it still has no `ended_at`. `SyncService`/startup recovery finalizes these
 * with `endedAt = checkpoint.timestamp`.
 */
async function getOrphanedCheckpoints(): Promise<PlaybackCheckpoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CheckpointRow>(
    `SELECT c.* FROM playback_checkpoints c
     LEFT JOIN sessions s ON s.id = c.session_id
     WHERE s.id IS NULL OR s.ended_at IS NULL
     ORDER BY c.timestamp ASC`,
  );
  return rows.map(mapCheckpoint);
}

async function deleteCheckpoint(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM playback_checkpoints WHERE session_id = ?", [sessionId]);
}

export const LocalDBService = {
  insertTrack,
  getTrackById,
  getTrackByContentHash,
  getTrackDetailData,
  getAllTracks,
  getPendingTracks,
  setTrackSyncStatus,
  insertSession,
  getSessionById,
  getSessionsByTrack,
  getSessionsForHistory,
  getPendingSessions,
  getAllSessions,
  insertRemoteSession,
  finalizeSession,
  setSessionSyncStatus,
  insertAnnotation,
  getAnnotationsByTrack,
  getAnnotationCounts,
  getAnnotationById,
  getPendingAnnotations,
  getAllAnnotations,
  insertRemoteAnnotation,
  applyRemoteAnnotationUpdate,
  updateAnnotation,
  softDeleteAnnotation,
  hardDeleteAnnotation,
  setAnnotationSyncStatus,
  insertPlaylist,
  getPlaylists,
  getAllPlaylists,
  getPlaylistById,
  getPendingPlaylists,
  updatePlaylist,
  softDeletePlaylist,
  deletePlaylist,
  insertRemotePlaylist,
  applyRemotePlaylistUpdate,
  setPlaylistSyncStatus,
  getSetting,
  setSetting,
  getPendingCounts,
  saveCheckpoint,
  getCheckpointBySession,
  getOrphanedCheckpoints,
  deleteCheckpoint,
};
