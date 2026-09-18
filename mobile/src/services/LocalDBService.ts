import * as Crypto from "expo-crypto";

import { getDatabase } from "@/lib/db/database";
import {
  mapAnnotation,
  mapCheckpoint,
  mapFolder,
  mapPlaylist,
  mapSession,
  mapTrack,
  type AnnotationRow,
  type CheckpointRow,
  type FolderRow,
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
  FolderSummary,
  InsertRemotePlaylistInput,
  LocalAnnotation,
  LocalFolder,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaybackCheckpoint,
  PlaylistItem,
  PendingCounts,
  SaveCheckpointInput,
  SyncStatus,
  TrackAvailability,
  TrackDetailData,
} from "@/lib/db/types";
import type { FolderTrackProgress } from "@/lib/folderPlay";
import type { HistoryItem } from "@/lib/history";
import { clampResumePosition } from "@/lib/resume";
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
    source: input.source ?? null,
    sourceUri: input.sourceUri ?? null,
    sourcePath: input.sourcePath ?? null,
    sourceSize: input.sourceSize ?? null,
    sourceMtime: input.sourceMtime ?? null,
    folderKey: input.folderKey ?? null,
    folderName: input.folderName ?? null,
    album: input.album ?? null,
    trackNumber: input.trackNumber ?? null,
    discNumber: input.discNumber ?? null,
    year: input.year ?? null,
    availability: "present",
  };

  await db.runAsync(
    `INSERT INTO tracks (
      id, server_id, content_hash, title, file_name, file_uri, duration_sec,
      file_size_bytes, mime_type, is_audiobook, author, narrator, artwork_url,
      total_play_count, total_listen_time_sec, last_played_at, sync_status,
      created_at, updated_at,
      source, source_uri, source_path, source_size, source_mtime,
      folder_key, folder_name, album, track_number, disc_number, year, availability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      track.source,
      track.sourceUri,
      track.sourcePath,
      track.sourceSize,
      track.sourceMtime,
      track.folderKey,
      track.folderName,
      track.album,
      track.trackNumber,
      track.discNumber,
      track.year,
      track.availability,
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

/** Finds the track previously imported from a given device location. */
async function getTrackBySourceUri(sourceUri: string): Promise<LocalTrack | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TrackRow>(
    "SELECT * FROM tracks WHERE source_uri = ? ORDER BY updated_at DESC LIMIT 1",
    [sourceUri],
  );
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

/**
 * Sessions for one track, newest first. Tombstoned rows are excluded so a
 * history entry the listener removed no longer decides where playback resumes
 * or how many times a track was heard.
 */
async function getSessionsByTrack(trackId: string): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM sessions WHERE track_id = ? AND deleted_at IS NULL ORDER BY started_at DESC",
    [trackId],
  );
  return rows.map(mapSession);
}

/** Newest-first session history joined with each track, for the History screen. */
async function getSessionsForHistory(limit = 200): Promise<HistoryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    `SELECT s.*, t.title AS track_title, t.author AS track_author,
            t.content_hash AS track_content_hash, t.is_audiobook AS track_is_audiobook,
            t.artwork_url AS track_artwork_url
     FROM sessions s
     JOIN tracks t ON t.id = s.track_id
     WHERE s.deleted_at IS NULL
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
      isAudiobook: row.track_is_audiobook === 1,
      artworkUrl: row.track_artwork_url,
    },
  }));
}

async function getPendingSessions(limit = 50): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions
     WHERE sync_status IN ('pending', 'failed') AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapSession);
}

/**
 * Removes a history entry by tombstoning it.
 *
 * The row stays so the next `getMyListeningHistory` pull cannot re-insert it
 * (see the v5 migration), and it is filtered out of history, per-track reads
 * and the push queue. There is no server-side delete act, so this is a
 * local-only removal: the session still exists on the server and on any other
 * device that already pulled it.
 */
async function softDeleteSession(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [Date.now(), Date.now(), id],
  );
}

/**
 * All local sessions, **including tombstones** — used by remote reconciliation.
 * This one deliberately does not filter `deleted_at`: reconcile needs to see the
 * tombstoned row so it does not treat the remote session as missing locally.
 */
async function getAllSessions(): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>("SELECT * FROM sessions");
  return rows.map(mapSession);
}

/**
 * Live sessions, newest first — tombstones excluded.
 *
 * The counterpart to `getAllSessions`, which must keep tombstones for
 * reconciliation. Anything that *derives* something for the listener (smart
 * playlists, resume points, streak figures) wants this one instead: a history
 * entry the listener deleted should stop influencing recommendations.
 *
 * Bounded by `limit` because smart playlists only ever reason about recent
 * behaviour; a decade of sessions would be read in full otherwise.
 */
async function getLiveSessions(limit = 2000): Promise<LocalSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT ?",
    [limit],
  );
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

// --- Folders --------------------------------------------------------------

/**
 * Every folder that has at least one track, with its progress. A folder row in
 * `folders` is optional — folders discovered through the media index are
 * synthesised here from `tracks.folder_key` alone, so nothing has to be
 * back-filled when a scan finds a new directory.
 *
 * `finished` means the track has at least one completed session. That is the
 * definition folder play uses to decide where to drop the needle.
 */
async function getFolderSummaries(): Promise<FolderSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    key: string;
    name: string;
    tree_uri: string | null;
    added_at: number;
    last_played_at: number | null;
    track_count: number;
    finished_count: number;
    total_duration_sec: number;
    artwork_url: string | null;
  }>(
    `SELECT
       t.folder_key AS key,
       COALESCE(f.name, t.folder_name, t.folder_key) AS name,
       f.tree_uri AS tree_uri,
       COALESCE(f.added_at, MIN(t.created_at)) AS added_at,
       f.last_played_at AS last_played_at,
       COUNT(*) AS track_count,
       SUM(CASE WHEN done.track_id IS NULL THEN 0 ELSE 1 END) AS finished_count,
       COALESCE(SUM(t.duration_sec), 0) AS total_duration_sec,
       (SELECT a.artwork_url FROM tracks a
         WHERE a.folder_key = t.folder_key AND a.artwork_url IS NOT NULL
         ORDER BY a.track_number IS NULL, a.track_number, a.title COLLATE NOCASE
         LIMIT 1) AS artwork_url
     FROM tracks t
     LEFT JOIN folders f ON f.key = t.folder_key
     LEFT JOIN (
       SELECT DISTINCT track_id FROM sessions
       WHERE completed = 1 AND deleted_at IS NULL
     ) done ON done.track_id = t.id
     WHERE t.folder_key IS NOT NULL
     GROUP BY t.folder_key
     ORDER BY name COLLATE NOCASE ASC`,
  );

  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    treeUri: row.tree_uri,
    addedAt: row.added_at,
    lastPlayedAt: row.last_played_at,
    trackCount: row.track_count,
    finishedCount: row.finished_count,
    totalDurationSec: row.total_duration_sec,
    artworkUrl: row.artwork_url,
  }));
}

async function getTracksByFolder(folderKey: string): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    "SELECT * FROM tracks WHERE folder_key = ? ORDER BY file_name COLLATE NOCASE ASC",
    [folderKey],
  );
  return rows.map(mapTrack);
}

/**
 * Playback state for every track in a folder, in one round trip.
 *
 * The obvious implementation is `getSessionsByTrack` per track, but a lecture
 * folder is easily 200 files and that becomes 200 bridge crossings on a screen
 * the listener opens expecting it to be instant. Both subqueries are indexed on
 * `sessions(track_id)`.
 *
 * `finished` is deliberately the same predicate `getFolderSummaries` counts
 * with (`completed = 1`), so the card's "13 of 24" and the track folder play
 * lands on can never disagree. The resume position is clamped in JS by the
 * shared helper rather than re-expressed in SQL — an epsilon written twice is
 * an epsilon that drifts.
 */
async function getFolderTrackProgress(
  folderKey: string,
): Promise<Record<string, FolderTrackProgress>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    track_id: string;
    duration_sec: number;
    completed_count: number;
    last_end_position_sec: number | null;
  }>(
    `SELECT
       t.id AS track_id,
       t.duration_sec AS duration_sec,
       (SELECT COUNT(*) FROM sessions s
         WHERE s.track_id = t.id AND s.completed = 1 AND s.deleted_at IS NULL) AS completed_count,
       (SELECT s.end_position_sec FROM sessions s
         WHERE s.track_id = t.id AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
         ORDER BY s.started_at DESC LIMIT 1) AS last_end_position_sec
     FROM tracks t
     WHERE t.folder_key = ?`,
    [folderKey],
  );

  const progress: Record<string, FolderTrackProgress> = {};
  for (const row of rows) {
    progress[row.track_id] = {
      finished: row.completed_count > 0,
      resumeSec: clampResumePosition(row.last_end_position_sec ?? 0, row.duration_sec),
    };
  }
  return progress;
}

async function getFolders(): Promise<LocalFolder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC");
  return rows.map(mapFolder);
}

/**
 * Records a folder the user explicitly granted. Re-granting an already-known
 * folder must not reset `added_at` — that timestamp is what orders the folder
 * list by how long the user has had it.
 */
async function upsertFolder(input: {
  key: string;
  name: string;
  treeUri?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO folders (key, name, tree_uri, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name,
       tree_uri = COALESCE(excluded.tree_uri, folders.tree_uri)`,
    [input.key, input.name, input.treeUri ?? null, Date.now()],
  );
}

/**
 * Records that a folder was played. Upserts rather than updates, because a
 * folder discovered through the media index has no `folders` row of its own and
 * still deserves a `last_played_at`.
 */
async function touchFolderPlayed(key: string, name: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO folders (key, name, added_at, last_played_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET last_played_at = excluded.last_played_at`,
    [key, name, now, now],
  );
}

/** Flags a referenced track whose bytes are no longer reachable. */
async function setTrackAvailability(
  id: string,
  availability: TrackAvailability,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE tracks SET availability = ?, updated_at = ? WHERE id = ?", [
    availability,
    Date.now(),
    id,
  ]);
}

/**
 * Re-points a track after its file moved. Only the location columns change —
 * the content hash stays authoritative, so history and annotations survive.
 *
 * `file_uri` is updated alongside `source_uri` because playback reads
 * `file_uri` (`TrackPlayerService.loadAndPlay`). Leaving it behind would mark
 * the track present while it still tried to play the path that is gone, which
 * is the one failure this method exists to prevent. The two columns start equal
 * at import and must stay equal.
 *
 * `availability` is set back to `present` in the same statement, so a relink can
 * never half-succeed. `artwork_checked_at` is cleared for the same reason: the
 * file at the new location has never been read, and its cover may differ from
 * whatever the row was examined for before.
 */
async function updateTrackLocation(
  id: string,
  input: {
    sourceUri: string;
    sourcePath: string | null;
    sourceSize: number | null;
    sourceMtime: number | null;
    folderKey: string | null;
    folderName: string | null;
  },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE tracks
     SET file_uri = ?, source_uri = ?, source_path = ?, source_size = ?, source_mtime = ?,
         folder_key = ?, folder_name = ?, availability = 'present',
         artwork_checked_at = NULL, updated_at = ?
     WHERE id = ?`,
    [
      input.sourceUri,
      input.sourceUri,
      input.sourcePath,
      input.sourceSize,
      input.sourceMtime,
      input.folderKey,
      input.folderName,
      Date.now(),
      id,
    ],
  );
}

/**
 * Records where a track's extracted cover art was written.
 *
 * Kept separate from `insertTrack` because extraction happens *after* the row
 * exists: it reads the file, and an import must not fail or slow down because a
 * picture could not be pulled out. A null `artwork_url` simply means the tile
 * keeps its gradient.
 *
 * `artwork_checked_at` is stamped in the same statement so a successful
 * extraction also takes the row out of the backfill's worklist.
 */
async function setTrackArtwork(id: string, artworkUrl: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE tracks SET artwork_url = ?, artwork_checked_at = ?, updated_at = ? WHERE id = ?",
    [artworkUrl, now, now, id],
  );
}

/**
 * Records that a track's file was read and carries no picture.
 *
 * Without this the backfill could never tell "no artwork here" from "not looked
 * at yet", and would re-read the same files on every pass.
 */
async function markTrackArtworkChecked(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE tracks SET artwork_checked_at = ? WHERE id = ?", [Date.now(), id]);
}

/**
 * Tracks that are playable but have not been examined for cover art yet — the
 * backfill's worklist.
 *
 * Only rows never checked are returned, and rows flagged `missing` are excluded
 * because reading them would fail; those are the relink screen's business.
 */
async function getTracksMissingArtwork(limit: number): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT * FROM tracks
     WHERE artwork_url IS NULL
       AND artwork_checked_at IS NULL
       AND availability = 'present'
       AND COALESCE(file_uri, source_uri) IS NOT NULL
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapTrack);
}

async function countTracksMissingArtwork(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM tracks
     WHERE artwork_url IS NULL
       AND artwork_checked_at IS NULL
       AND availability = 'present'
       AND COALESCE(file_uri, source_uri) IS NOT NULL`,
  );
  return row?.total ?? 0;
}

/**
 * Tracks whose audio file is known to be gone, newest first.
 *
 * Only `availability = 'missing'`, which is written in two places: a re-import
 * that finds a file replaced at the same URI, and a play attempt whose file no
 * longer resolves (`TrackPlayerService.reportUnreachableTrack`). A *scan*
 * cannot write it for a moved file — a scan only ever sees files that exist, so
 * it learns about a missing one by matching content and checking the old
 * location, which is `ImportService`'s relink path rather than this flag.
 *
 * So this is the list the user can actually act on, not a guess from a stale
 * path. Its length is a floor, not a total: files deleted while nothing has
 * played or scanned them are not in it yet.
 */
async function getTracksByAvailability(
  availability: TrackAvailability,
): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    "SELECT * FROM tracks WHERE availability = ? ORDER BY updated_at DESC",
    [availability],
  );
  return rows.map(mapTrack);
}

export type TrackActivityCounts = {
  sessionCount: number;
  /** Seconds actually listened, across live sessions. */
  listenedSec: number;
  annotationCount: number;
};

/**
 * What is recorded against each of the given tracks, in two queries rather than
 * two per track.
 *
 * This is what makes a relink worth offering: "14 sessions and 3 notes" is the
 * thing at stake, and the list it is shown on is at its longest precisely when
 * the user moved a whole library at once. Tombstoned rows are excluded, matching
 * `getLiveSessions` — a history entry the listener deleted should not inflate
 * the figure.
 */
async function getTrackActivityCounts(
  trackIds: readonly string[],
): Promise<Map<string, TrackActivityCounts>> {
  const counts = new Map<string, TrackActivityCounts>();
  if (trackIds.length === 0) {
    return counts;
  }
  const db = await getDatabase();
  const placeholders = trackIds.map(() => "?").join(", ");
  const ids = [...trackIds];

  const sessionRows = await db.getAllAsync<{
    track_id: string;
    session_count: number;
    listened_sec: number;
  }>(
    `SELECT track_id, COUNT(*) AS session_count,
            COALESCE(SUM(duration_listened_sec), 0) AS listened_sec
       FROM sessions
      WHERE deleted_at IS NULL AND track_id IN (${placeholders})
      GROUP BY track_id`,
    ids,
  );

  const annotationRows = await db.getAllAsync<{
    track_id: string;
    annotation_count: number;
  }>(
    `SELECT track_id, COUNT(*) AS annotation_count
       FROM annotations
      WHERE deleted_at IS NULL AND track_id IN (${placeholders})
      GROUP BY track_id`,
    ids,
  );

  for (const id of ids) {
    counts.set(id, { sessionCount: 0, listenedSec: 0, annotationCount: 0 });
  }
  for (const row of sessionRows) {
    const entry = counts.get(row.track_id);
    if (entry) {
      entry.sessionCount = row.session_count;
      entry.listenedSec = row.listened_sec;
    }
  }
  for (const row of annotationRows) {
    const entry = counts.get(row.track_id);
    if (entry) {
      entry.annotationCount = row.annotation_count;
    }
  }

  return counts;
}

/** Size + mtime of the device-side original, used to skip unchanged files on rescan. */
async function getSourceSignatures(): Promise<
  Record<string, { sourcePath: string | null; sourceSize: number | null; sourceMtime: number | null }>
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    content_hash: string;
    source_path: string | null;
    source_size: number | null;
    source_mtime: number | null;
  }>("SELECT content_hash, source_path, source_size, source_mtime FROM tracks");
  const signatures: Record<
    string,
    { sourcePath: string | null; sourceSize: number | null; sourceMtime: number | null }
  > = {};
  for (const row of rows) {
    signatures[row.content_hash] = {
      sourcePath: row.source_path,
      sourceSize: row.source_size,
      sourceMtime: row.source_mtime,
    };
  }
  return signatures;
}

export const LocalDBService = {
  insertTrack,
  getTrackById,
  getTrackByContentHash,
  getTrackBySourceUri,
  getTrackDetailData,
  getAllTracks,
  getTracksByAvailability,
  getTrackActivityCounts,
  getPendingTracks,
  setTrackSyncStatus,
  insertSession,
  getSessionById,
  getSessionsByTrack,
  getSessionsForHistory,
  getPendingSessions,
  getLiveSessions,
  getAllSessions,
  insertRemoteSession,
  finalizeSession,
  setSessionSyncStatus,
  softDeleteSession,
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
  getFolderSummaries,
  getTracksByFolder,
  getFolderTrackProgress,
  getFolders,
  upsertFolder,
  touchFolderPlayed,
  setTrackAvailability,
  setTrackArtwork,
  markTrackArtworkChecked,
  getTracksMissingArtwork,
  countTracksMissingArtwork,
  updateTrackLocation,
  getSourceSignatures,
};
