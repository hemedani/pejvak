import * as Crypto from "expo-crypto";

import { getDatabase } from "@/lib/db/database";
import {
  mapAnnotation,
  mapCheckpoint,
  mapContextPlay,
  mapDownloadJob,
  mapFolder,
  mapOnlineCollection,
  mapPlaylist,
  mapSession,
  mapTrack,
  type AnnotationRow,
  type CheckpointRow,
  type ContextPlayRow,
  type DownloadJobRow,
  type FolderRow,
  type HistoryRow,
  type OnlineCollectionRow,
  type PlaylistRow,
  type SessionRow,
  type TrackRow,
} from "@/lib/db/mappers";
import type {
  ContextRunProgress,
  ContextStats,
  ContextType,
  CreateAnnotationInput,
  CreateContextPlayInput,
  CreatePlaylistInput,
  CreateSessionInput,
  CreateTrackInput,
  FinalizeContextPlayInput,
  FinalizeSessionInput,
  FolderSummary,
  InsertRemoteOnlineCollectionInput,
  InsertRemotePlaylistInput,
  LocalAnnotation,
  LocalContextPlay,
  LocalFolder,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaybackCheckpoint,
  PlaylistItem,
  PendingCounts,
  SaveCheckpointInput,
  SyncStatus,
  TouchContextPlayInput,
  CreateDownloadJobInput,
  DownloadState,
  LocalDownloadJob,
  LocalOnlineCollection,
  TrackAvailability,
  TrackDetailData,
  UpsertOnlineCollectionInput,
} from "@/lib/db/types";
import type { FolderTrackProgress } from "@/lib/folderPlay";
import type { HistoryItem } from "@/lib/history";
import { clampResumePosition } from "@/lib/resume";
import type {
  AnnotationUpdate,
  OnlineCollectionUpdate,
  PlaylistUpdate,
  RemoteAnnotation,
  RemoteContextPlay,
  RemoteSession,
} from "@/lib/reconcile";

function newId(): string {
  return Crypto.randomUUID();
}

/**
 * A fresh listening-stretch id.
 *
 * Minted here rather than in the player so every local id comes from the same
 * generator — and so the player never imports a native crypto module, which
 * would drag one into every test that touches playback.
 */
function newStretchId(): string {
  return newId();
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
    origin: input.origin ?? "local",
    streamUrl: input.streamUrl ?? null,
    sourceId: input.sourceId ?? null,
    externalId: input.externalId ?? null,
    collectionKey: input.collectionKey ?? null,
    collectionTitle: input.collectionTitle ?? null,
    downloadedAt: input.downloadedAt ?? null,
    downloadPath: input.downloadPath ?? null,
  };

  await db.runAsync(
    `INSERT INTO tracks (
      id, server_id, content_hash, title, file_name, file_uri, duration_sec,
      file_size_bytes, mime_type, is_audiobook, author, narrator, artwork_url,
      total_play_count, total_listen_time_sec, last_played_at, sync_status,
      created_at, updated_at,
      source, source_uri, source_path, source_size, source_mtime,
      folder_key, folder_name, album, track_number, disc_number, year, availability,
      origin, stream_url, source_id, external_id, collection_key, collection_title,
      downloaded_at, download_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      track.origin,
      track.streamUrl,
      track.sourceId,
      track.externalId,
      track.collectionKey,
      track.collectionTitle,
      track.downloadedAt,
      track.downloadPath,
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
  const id = input.id ?? newId();
  const session: LocalSession = {
    id,
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
    contextPlayId: input.contextPlayId ?? null,
    contextType: input.contextType ?? null,
    contextKey: input.contextKey ?? null,
    // Defaulting the group to the row's own id is what makes a single-track
    // listen a stretch of one, so nothing downstream has to special-case it.
    stretchId: input.stretchId ?? id,
    seeked: input.seeked ?? false,
  };

  await db.runAsync(
    `INSERT INTO sessions (
      id, server_id, track_id, content_hash, started_at, ended_at,
      start_position_sec, end_position_sec, duration_listened_sec, playback_speed,
      completed, interrupted, device_info, sync_status, created_at, updated_at,
      context_play_id, context_type, context_key, stretch_id, seeked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      session.contextPlayId,
      session.contextType,
      session.contextKey,
      session.stretchId,
      session.seeked ? 1 : 0,
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

/**
 * Newest-first session history joined with each track, for the History screen.
 *
 * The collection title comes along in the same join rather than being looked up
 * per row: the list is up to 200 entries, and "which folder was this?" is a
 * caption on each of them.
 *
 * `limit` counts *stretches*, not rows. A stretch is read off its member rows,
 * so cutting the page at a row count would hand the caller part of a listen: a
 * card missing the track it ended on, and a completeness verdict computed from
 * a prefix of the evidence. Picking the newest N groups first and then taking
 * every member of each costs one bounded subquery and keeps each stretch whole.
 */
async function getSessionsForHistory(limit = 200): Promise<HistoryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    `SELECT s.*, t.title AS track_title, t.author AS track_author,
            t.content_hash AS track_content_hash, t.is_audiobook AS track_is_audiobook,
            t.artwork_url AS track_artwork_url, t.duration_sec AS track_duration_sec,
            cp.context_title AS context_title
     FROM sessions s
     JOIN tracks t ON t.id = s.track_id
     LEFT JOIN context_plays cp ON cp.id = s.context_play_id
     WHERE s.deleted_at IS NULL
       AND s.stretch_id IN (
         SELECT stretch_id FROM sessions
         WHERE deleted_at IS NULL
         GROUP BY stretch_id
         ORDER BY MAX(started_at) DESC
         LIMIT ?
       )
     ORDER BY s.started_at DESC`,
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
      durationSec: row.track_duration_sec,
    },
    contextTitle: row.context_title,
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
  await softDeleteSessions([id]);
}

/**
 * Tombstones several history entries at once.
 *
 * The History list shows a stretch as a single row, so removing that row has to
 * remove every track it covered. Tombstoning one member would leave the card on
 * screen with a different end track and a fresh completeness verdict — the row
 * the listener deleted would appear not to have gone anywhere.
 */
async function softDeleteSessions(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDatabase();
  const now = Date.now();
  const placeholders = ids.map(() => "?").join(", ");
  await db.runAsync(
    `UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
    [now, now, ...ids],
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
      completed, interrupted, device_info, sync_status, created_at, updated_at,
      context_play_id, context_type, context_key, stretch_id, seeked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?)`,
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
      input.contextPlayId,
      input.contextType,
      input.contextKey,
      // A session pulled from another device joins the stretch that device
      // minted, so a listen split across two phones is still one entry. A row
      // the server has no group for becomes a stretch of one, which is what the
      // v10 backfill made of every local row written before stretches existed.
      input.stretchId ?? id,
      input.seeked ? 1 : 0,
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

/**
 * Flags the session as having been scrubbed.
 *
 * Written the moment it happens rather than at finalize, so a listen cut short
 * by a kill still knows it was not heard straight through — and guarded by the
 * caller, so a listener dragging the scrubber costs one write, not fifty.
 */
async function markSessionSeeked(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE sessions SET seeked = 1, updated_at = ? WHERE id = ? AND sync_status != 'synced'",
    [Date.now(), id],
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

// --- Collection runs (context plays) --------------------------------------

async function insertContextPlay(input: CreateContextPlayInput): Promise<LocalContextPlay> {
  const db = await getDatabase();
  const now = Date.now();
  const run: LocalContextPlay = {
    id: input.id ?? newId(),
    serverId: null,
    contextType: input.contextType,
    contextKey: input.contextKey,
    contextTitle: input.contextTitle,
    trackCount: Math.max(0, Math.round(input.trackCount)),
    startedAt: input.startedAt,
    endedAt: null,
    lastIndex: Math.max(0, Math.round(input.lastIndex ?? 0)),
    lastTrackId: input.lastTrackId ?? null,
    lastPositionSec: Math.max(0, Math.round(input.lastPositionSec ?? 0)),
    listenedSec: 0,
    finishedCount: 0,
    completed: false,
    interrupted: false,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO context_plays (
      id, server_id, context_type, context_key, context_title, track_count,
      started_at, ended_at, last_index, last_track_id, last_position_sec,
      listened_sec, finished_count, completed, interrupted, deleted_at,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, 0, 0, 0, NULL, 'pending', ?, ?)`,
    [
      run.id,
      run.serverId,
      run.contextType,
      run.contextKey,
      run.contextTitle,
      run.trackCount,
      run.startedAt,
      run.lastIndex,
      run.lastTrackId,
      run.lastPositionSec,
      run.createdAt,
      run.updatedAt,
    ],
  );

  return run;
}

async function getContextPlayById(id: string): Promise<LocalContextPlay | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ContextPlayRow>(
    "SELECT * FROM context_plays WHERE id = ?",
    [id],
  );
  return row ? mapContextPlay(row) : null;
}

/**
 * Records where a run has got to, as it moves from track to track.
 *
 * Deliberately does not touch `sync_status`: a run is only worth sending once
 * it has ended, and marking it dirty on every track change would queue an
 * unfinished run for the push loop.
 */
async function touchContextPlay(id: string, input: TouchContextPlayInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE context_plays
     SET last_index = ?, last_track_id = ?, last_position_sec = ?, updated_at = ?
     WHERE id = ? AND ended_at IS NULL`,
    [
      Math.max(0, Math.round(input.lastIndex)),
      input.lastTrackId,
      Math.max(0, Math.round(input.lastPositionSec)),
      Date.now(),
      id,
    ],
  );
}

/**
 * Closes a run, and derives its figures from its own sessions.
 *
 * `listened_sec` and `finished_count` are computed here rather than
 * accumulated in memory, so a run that survived a kill still reports what
 * actually happened — the session rows are the record, and the run summarises
 * them. `finished_count` counts *distinct* tracks, because replaying one track
 * three times is not three finished lectures.
 *
 * The `ended_at IS NULL` guard makes a run end exactly once. Every path that
 * ends a run (the queue running out, playback moving elsewhere, startup
 * recovery) can therefore call this without coordinating.
 */
async function finalizeContextPlay(
  id: string,
  input: FinalizeContextPlayInput,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE context_plays
     SET ended_at = ?,
         completed = ?,
         interrupted = ?,
         listened_sec = COALESCE((
           SELECT SUM(s.duration_listened_sec) FROM sessions s
           WHERE s.context_play_id = context_plays.id AND s.deleted_at IS NULL
         ), 0),
         finished_count = COALESCE((
           SELECT COUNT(DISTINCT s.track_id) FROM sessions s
           WHERE s.context_play_id = context_plays.id
             AND s.completed = 1 AND s.deleted_at IS NULL
         ), 0),
         sync_status = 'pending',
         updated_at = ?
     WHERE id = ? AND ended_at IS NULL`,
    [
      input.endedAt,
      input.completed ? 1 : 0,
      input.interrupted ? 1 : 0,
      Date.now(),
      id,
    ],
  );
}

/** Runs that never closed — a kill, or a crash mid-collection. */
async function getOpenContextPlays(): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>(
    "SELECT * FROM context_plays WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at ASC",
  );
  return rows.map(mapContextPlay);
}

/** A run's live figures, derived from its sessions rather than stored. */
async function getContextRunProgress(id: string): Promise<ContextRunProgress> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    listened_sec: number;
    session_count: number;
    finished_count: number;
  }>(
    `SELECT
       COALESCE(SUM(duration_listened_sec), 0) AS listened_sec,
       COUNT(*) AS session_count,
       COUNT(DISTINCT CASE WHEN completed = 1 THEN track_id END) AS finished_count
     FROM sessions
     WHERE context_play_id = ? AND deleted_at IS NULL`,
    [id],
  );
  return {
    listenedSec: row?.listened_sec ?? 0,
    sessionCount: row?.session_count ?? 0,
    finishedCount: row?.finished_count ?? 0,
  };
}

/** Closed runs, newest first — the collection half of the History screen. */
async function getContextPlaysForHistory(limit = 200): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>(
    `SELECT * FROM context_plays
     WHERE deleted_at IS NULL AND ended_at IS NOT NULL
     ORDER BY started_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapContextPlay);
}

/** Every run of one collection, newest first. Includes the open one. */
async function getContextPlaysByKey(
  contextType: ContextType,
  contextKey: string,
  limit = 20,
): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>(
    `SELECT * FROM context_plays
     WHERE context_type = ? AND context_key = ? AND deleted_at IS NULL
     ORDER BY started_at DESC
     LIMIT ?`,
    [contextType, contextKey, limit],
  );
  return rows.map(mapContextPlay);
}

/**
 * Totals for one collection.
 *
 * `bestFinishedCount` is the furthest any single run got, which is what makes a
 * partially completed series visible: the tracks finished *now* are a fact
 * about the library, but the best run is a fact about the listener's attempt.
 */
async function getContextStats(
  contextType: ContextType,
  contextKey: string,
): Promise<ContextStats> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    play_count: number;
    completed_play_count: number;
    listened_sec: number;
    last_played_at: number | null;
    best_finished_count: number;
  }>(
    `SELECT
       COUNT(*) AS play_count,
       COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completed_play_count,
       COALESCE(SUM(listened_sec), 0) AS listened_sec,
       MAX(COALESCE(ended_at, started_at)) AS last_played_at,
       COALESCE(MAX(finished_count), 0) AS best_finished_count
     FROM context_plays
     WHERE context_type = ? AND context_key = ? AND deleted_at IS NULL`,
    [contextType, contextKey],
  );
  return {
    playCount: row?.play_count ?? 0,
    completedPlayCount: row?.completed_play_count ?? 0,
    listenedSec: row?.listened_sec ?? 0,
    lastPlayedAt: row?.last_played_at ?? null,
    bestFinishedCount: row?.best_finished_count ?? 0,
  };
}

/**
 * All local runs, **including tombstones** — used by remote reconciliation, the
 * same way `getAllSessions` is: a tombstoned row has to be visible so a pull
 * does not treat it as missing.
 */
async function getAllContextPlays(): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>("SELECT * FROM context_plays");
  return rows.map(mapContextPlay);
}

/** Ended runs still waiting to reach the server. */
async function getPendingContextPlays(limit = 50): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>(
    `SELECT * FROM context_plays
     WHERE sync_status IN ('pending', 'failed')
       AND deleted_at IS NULL
       AND ended_at IS NOT NULL
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapContextPlay);
}

async function insertRemoteContextPlay(input: RemoteContextPlay): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const id = input.clientId ?? input.serverId;
  await db.runAsync(
    `INSERT OR IGNORE INTO context_plays (
      id, server_id, context_type, context_key, context_title, track_count,
      started_at, ended_at, last_index, last_track_id, last_position_sec,
      listened_sec, finished_count, completed, interrupted, deleted_at,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced', ?, ?)`,
    [
      id,
      input.serverId,
      input.contextType,
      input.contextKey,
      input.contextTitle,
      Math.round(input.trackCount),
      input.startedAt,
      input.endedAt,
      Math.round(input.lastIndex),
      input.lastTrackId,
      Math.round(input.lastPositionSec),
      Math.round(input.listenedSec),
      Math.round(input.finishedCount),
      input.completed ? 1 : 0,
      input.interrupted ? 1 : 0,
      now,
      input.updatedAt,
    ],
  );
}

async function setContextPlaySyncStatus(
  id: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE context_plays
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE id = ?`,
    [status, serverId ?? null, Date.now(), id],
  );
}

/**
 * Tombstones a run so its removal survives the next pull. There is no
 * server-side delete act for runs, exactly as for sessions — this hides the
 * entry on this device and nowhere else.
 */
async function softDeleteContextPlay(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE context_plays SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

async function deleteContextPlay(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM context_plays WHERE id = ?", [id]);
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
    contextPlays: await count("context_plays"),
    onlineCollections: await count("online_collections"),
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
      duration_listened_sec, playback_speed, started_at, timestamp, device_info,
      context_play_id, stretch_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.contextPlayId ?? null,
      input.stretchId ?? null,
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
    play_count: number;
    completed_play_count: number;
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
       (SELECT COUNT(*) FROM context_plays cp
         WHERE cp.context_type = 'folder' AND cp.context_key = t.folder_key
           AND cp.deleted_at IS NULL) AS play_count,
       (SELECT COUNT(*) FROM context_plays cp
         WHERE cp.context_type = 'folder' AND cp.context_key = t.folder_key
           AND cp.completed = 1 AND cp.deleted_at IS NULL) AS completed_play_count,
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
    playCount: row.play_count,
    completedPlayCount: row.completed_play_count,
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
 *
 * Streams are excluded as well, and the exclusion is a filter rather than a
 * stamp on purpose. An online track that has not been downloaded keeps its
 * source's URL in `file_uri`, and the reader behind this accepts only a file, a
 * SAF URI, an asset or a resource path — so every streamed row would be a native
 * call that can only throw, spending the pass's limit on rows that can never
 * succeed and holding this count above zero forever. Filtering rather than
 * stamping is what makes that safe: downloading writes a real path into
 * `file_uri`, and the row is a candidate again on that day. Stamping would have
 * denied it the artwork that arrives with the download.
 *
 * The same rule lives in TypeScript as `isStreamUri`; the two have to agree.
 */
async function getTracksMissingArtwork(limit: number): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT * FROM tracks
     WHERE artwork_url IS NULL
       AND artwork_checked_at IS NULL
       AND availability = 'present'
       AND COALESCE(file_uri, source_uri) IS NOT NULL
       AND COALESCE(file_uri, source_uri) NOT LIKE 'http://%'
       AND COALESCE(file_uri, source_uri) NOT LIKE 'https://%'
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
       AND COALESCE(file_uri, source_uri) IS NOT NULL
       AND COALESCE(file_uri, source_uri) NOT LIKE 'http://%'
       AND COALESCE(file_uri, source_uri) NOT LIKE 'https://%'`,
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


// --- Online tracks --------------------------------------------------------

/**
 * The row for an online item, created on first sight and refreshed after.
 *
 * Keyed on `content_hash`, which for online audio is derived from the source and
 * the item's own id — never from the stream URL, which is signed and rotates.
 * Re-resolving a collection therefore lands on the rows that already exist
 * instead of minting a second copy of the same episode every time a signature
 * expires.
 *
 * `file_uri` is the one column the player reads, so an online row sets it to the
 * stream URL and a local row sets it to a path: streaming needs no second code
 * path through the audio engine. The one case that must not be overwritten is a
 * *downloaded* track, whose `file_uri` is now the copy in app storage — writing
 * the expiring URL over it would silently turn offline playback back into
 * streaming, so the update leaves it alone once `downloaded_at` is set.
 *
 * The duration is only ever filled in, never replaced: the source does not
 * report one, so the first real reading comes from the audio itself.
 */
async function upsertOnlineTrack(input: {
  contentHash: string;
  title: string;
  streamUrl: string;
  sourceId: string;
  externalId: string;
  collectionKey: string;
  collectionTitle: string;
  artworkUrl?: string | null;
  album?: string | null;
  author?: string | null;
  durationSec?: number;
  trackNumber?: number;
}): Promise<LocalTrack> {
  const existing = await getTrackByContentHash(input.contentHash);
  const db = await getDatabase();
  const now = Date.now();
  const durationSec = Math.round(input.durationSec ?? 0);

  if (existing) {
    await db.runAsync(
      `UPDATE tracks
       SET title = ?,
           stream_url = ?,
           file_uri = CASE WHEN downloaded_at IS NULL THEN ? ELSE file_uri END,
           collection_key = ?,
           collection_title = ?,
           artwork_url = COALESCE(?, artwork_url),
           album = COALESCE(?, album),
           author = COALESCE(?, author),
           track_number = COALESCE(?, track_number),
           duration_sec = CASE WHEN duration_sec = 0 THEN ? ELSE duration_sec END,
           updated_at = ?
       WHERE id = ?`,
      [
        input.title,
        input.streamUrl,
        input.streamUrl,
        input.collectionKey,
        input.collectionTitle,
        input.artworkUrl ?? null,
        input.album ?? null,
        input.author ?? null,
        input.trackNumber ?? null,
        durationSec,
        now,
        existing.id,
      ],
    );
    return (await getTrackById(existing.id)) ?? existing;
  }

  return insertTrack({
    contentHash: input.contentHash,
    title: input.title,
    fileUri: input.streamUrl,
    durationSec,
    fileSizeBytes: 0,
    // Long-form by nature: a podcast series or a course wants the resume and
    // speed behaviour an audiobook gets, not a song's.
    isAudiobook: true,
    author: input.author ?? null,
    artworkUrl: input.artworkUrl ?? null,
    album: input.album ?? null,
    trackNumber: input.trackNumber ?? null,
    origin: "online",
    streamUrl: input.streamUrl,
    sourceId: input.sourceId,
    externalId: input.externalId,
    collectionKey: input.collectionKey,
    collectionTitle: input.collectionTitle,
  });
}

/**
 * Every row belonging to one online collection, in the source's own order.
 *
 * Ordered by `track_number` because that is the position the source gave the
 * item, and a course played in the wrong order is not the course.
 */
async function getTracksByCollection(collectionKey: string): Promise<LocalTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT * FROM tracks
     WHERE collection_key = ?
     ORDER BY COALESCE(track_number, 0) ASC, created_at ASC`,
    [collectionKey],
  );
  return rows.map(mapTrack);
}

/**
 * Per-track progress for one online collection.
 *
 * The same two facts `getFolderTrackProgress` answers, keyed on the collection
 * instead of the folder — because an online collection is not a folder until it
 * has been downloaded. Reading it from `folder_key` would leave a streamed
 * course with no "Finished" and no "Resume at", which is exactly the state the
 * listener spends most of their time in: the point of streaming is that nothing
 * is on the device yet.
 *
 * `completed = 1` is the same predicate the folder card uses, so a downloaded
 * course reports the same numbers before and after the download.
 */
async function getCollectionTrackProgress(
  collectionKey: string,
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
     WHERE t.collection_key = ?`,
    [collectionKey],
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

/**
 * The duration the source never reported, written back once the player knows it.
 *
 * Fills a zero and nothing else. The first real duration came from the audio
 * itself; a later reading that disagrees is a buffering artefact, and letting it
 * through would move every resume position in the collection.
 */
async function setTrackDuration(id: string, durationSec: number): Promise<void> {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return;
  }
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE tracks SET duration_sec = ?, updated_at = ? WHERE id = ? AND duration_sec = 0",
    [Math.round(durationSec), Date.now(), id],
  );
}

/**
 * Records that a track's bytes are now on the device.
 *
 * `file_uri` moves to the downloaded copy while `stream_url` stays put, so the
 * row keeps both halves of its story: where the audio is, and where it came
 * from. `availability` is set present in the same statement — a download that
 * succeeded must not leave the row flagged missing.
 *
 * `artwork_checked_at` is deliberately left alone: a row with no remote cover
 * should still be examined by the backfill, now that a local file exists to
 * read one out of.
 */
async function markTrackDownloaded(input: {
  id: string;
  fileUri: string;
  downloadPath: string;
  fileSizeBytes: number;
  durationSec: number;
  folderKey: string;
  folderName: string;
  trackNumber: number;
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE tracks
     SET file_uri = ?, download_path = ?, downloaded_at = ?, file_size_bytes = ?,
         duration_sec = CASE WHEN duration_sec = 0 THEN ? ELSE duration_sec END,
         folder_key = ?, folder_name = ?, track_number = ?,
         availability = 'present', updated_at = ?
     WHERE id = ?`,
    [
      input.fileUri,
      input.downloadPath,
      now,
      Math.round(input.fileSizeBytes),
      Math.round(input.durationSec),
      input.folderKey,
      input.folderName,
      input.trackNumber,
      now,
      input.id,
    ],
  );
}

/**
 * Where a collection's downloaded bytes actually are.
 *
 * Read from `download_path` rather than recomputed from the collection's title,
 * because the title is not stable: a show renamed on the source between the
 * download and the delete would have the app looking in a directory that no
 * longer exists, leaving the real one on disk forever with nothing pointing at
 * it. The rows are the record of where each file was put, so this reads that
 * record instead of deriving it a second time.
 */
async function getDownloadedTrackPaths(collectionKey: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ download_path: string | null }>(
    `SELECT download_path FROM tracks
     WHERE collection_key = ? AND downloaded_at IS NOT NULL AND download_path IS NOT NULL`,
    [collectionKey],
  );
  return rows
    .map((row) => row.download_path)
    .filter((value): value is string => value !== null);
}

/**
 * Hand a collection's tracks back to streaming, keeping every row.
 *
 * The exact inverse of `markTrackDownloaded`, and the reason deleting a
 * download is not the same as deleting the content. The row is what history,
 * statistics, annotations and resume positions hang off, and its identity is
 * `content_hash` — which downloading never changed. So the bytes go and the row
 * stays, pointing back at the stream it came from: a course finished last year
 * keeps its finished count after the listener reclaims the space.
 *
 * `folder_key` is cleared along with the bytes so the folder leaves the Library
 * in the same breath — a folder whose tracks are not on the device would open
 * onto nothing, and the Folder view is derived from this column.
 *
 * `availability` returns to `present` deliberately. `missing` is the flag that
 * offers a relink, and there is no file left to relink to; the stream is where
 * this row now lives.
 */
async function forgetDownloadedTracks(collectionKey: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE tracks
     SET file_uri = COALESCE(stream_url, file_uri),
         download_path = NULL,
         downloaded_at = NULL,
         file_size_bytes = 0,
         folder_key = NULL,
         folder_name = NULL,
         availability = CASE WHEN stream_url IS NULL THEN 'missing' ELSE 'present' END,
         updated_at = ?
     WHERE collection_key = ? AND downloaded_at IS NOT NULL`,
    [Date.now(), collectionKey],
  );
}

// --- Online collections ---------------------------------------------------

/**
 * Writes what a catalogue read learned about a collection.
 *
 * Only catalogue facts. The listener's own state — favourited, how far they got,
 * how much is downloaded — is written by the setters below, so a background
 * refresh can never quietly un-favourite something.
 *
 * `deleted_at` is cleared on conflict: a collection the listener removed and
 * then re-opened from Browse is one they want back, and a tombstone left in
 * place would make the row invisible to every read.
 */
async function upsertOnlineCollection(
  input: UpsertOnlineCollectionInput,
): Promise<LocalOnlineCollection> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO online_collections (
       key, server_id, source_id, external_id, title, subtitle, artwork_url,
       language_code, track_count, page_url, is_favorite, last_opened_at,
       download_state, deleted_at, sync_status, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'none', NULL, 'pending', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       title = excluded.title,
       subtitle = COALESCE(excluded.subtitle, online_collections.subtitle),
       artwork_url = COALESCE(excluded.artwork_url, online_collections.artwork_url),
       track_count = CASE WHEN excluded.track_count > 0
                          THEN excluded.track_count
                          ELSE online_collections.track_count END,
       page_url = COALESCE(excluded.page_url, online_collections.page_url),
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
    [
      input.key,
      input.sourceId,
      input.externalId,
      input.title,
      input.subtitle ?? null,
      input.artworkUrl ?? null,
      input.languageCode,
      input.trackCount ?? 0,
      input.pageUrl ?? null,
      now,
      now,
    ],
  );
  const saved = await getOnlineCollection(input.key);
  if (!saved) {
    throw new Error("Online collection was not saved.");
  }
  return saved;
}

async function getOnlineCollection(key: string): Promise<LocalOnlineCollection | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<OnlineCollectionRow>(
    "SELECT * FROM online_collections WHERE key = ? AND deleted_at IS NULL",
    [key],
  );
  return row ? mapOnlineCollection(row) : null;
}

/** Saved collections, most recently touched first. */
async function getOnlineCollections(): Promise<LocalOnlineCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OnlineCollectionRow>(
    `SELECT * FROM online_collections
     WHERE deleted_at IS NULL
     ORDER BY COALESCE(last_opened_at, updated_at) DESC`,
  );
  return rows.map(mapOnlineCollection);
}

/** The Favorites tab: only what the listener explicitly kept. */
async function getFavoriteOnlineCollections(): Promise<LocalOnlineCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OnlineCollectionRow>(
    `SELECT * FROM online_collections
     WHERE deleted_at IS NULL AND is_favorite = 1
     ORDER BY updated_at DESC`,
  );
  return rows.map(mapOnlineCollection);
}

/**
 * Collections with something in flight, so a download interrupted by a kill can
 * be picked up again without the listener finding the screen they started it on.
 */
async function getDownloadingOnlineCollections(): Promise<LocalOnlineCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OnlineCollectionRow>(
    `SELECT * FROM online_collections
     WHERE deleted_at IS NULL AND download_state = 'downloading'
     ORDER BY updated_at ASC`,
  );
  return rows.map(mapOnlineCollection);
}

/**
 * Favourite / unfavourite, which is what the Favorites tab is made of.
 *
 * Dirties `sync_status`: the shelf the listener curated is worth carrying to
 * their other devices, and a favourite that never left the phone would make the
 * server's copy of the collection quietly wrong.
 */
async function setOnlineCollectionFavorite(key: string, isFavorite: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE online_collections
     SET is_favorite = ?, sync_status = 'pending', updated_at = ?
     WHERE key = ?`,
    [isFavorite ? 1 : 0, Date.now(), key],
  );
}

/**
 * Records how much of a collection is on this device.
 *
 * Dirties `sync_status` so "I downloaded this course" survives the phone it
 * happened on — it is the fact that lets the collection be offered for
 * re-download elsewhere, and the reason the address is kept at all.
 */
async function setOnlineCollectionDownloadState(
  key: string,
  state: DownloadState,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE online_collections
     SET download_state = ?, sync_status = 'pending', updated_at = ?
     WHERE key = ?`,
    [state, Date.now(), key],
  );
}

/**
 * Marks a collection as opened, which is what orders the Continue tab.
 *
 * This does dirty `sync_status`. `last_opened_at` is the one field that makes
 * Continue mean anything on a second device — a course started on the phone
 * should be waiting on the tablet — and the cost is one small row update inside
 * a batch that is already going out alongside the streaming it accompanies.
 */
async function touchOnlineCollectionOpened(key: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE online_collections
     SET last_opened_at = ?, sync_status = 'pending', updated_at = ?
     WHERE key = ?`,
    [now, now, key],
  );
}

/**
 * Removes a collection from the listener's list.
 *
 * A tombstone rather than a DELETE, for the same reason sessions are tombstoned:
 * the row is synced, and a hard delete would simply be re-inserted by the next
 * pull. The downloaded files are deliberately left on the device — deleting
 * someone's audio because they tidied a list is not a trade they agreed to.
 */
async function softDeleteOnlineCollection(key: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE online_collections
     SET deleted_at = ?, is_favorite = 0, download_state = 'none', sync_status = 'pending',
         updated_at = ?
     WHERE key = ?`,
    [now, now, key],
  );
}

/**
 * Collections with a local change the server has not seen.
 *
 * Tombstoned rows are included. A removal is a change like any other, and the
 * row may only be dropped once the server has been told — which is why this
 * reads `sync_status` rather than filtering `deleted_at IS NULL`.
 */
async function getPendingOnlineCollections(
  limit = 50,
): Promise<LocalOnlineCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OnlineCollectionRow>(
    `SELECT * FROM online_collections
     WHERE sync_status IN ('pending', 'failed')
     ORDER BY updated_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapOnlineCollection);
}

async function setOnlineCollectionSyncStatus(
  key: string,
  status: SyncStatus,
  serverId?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE online_collections
     SET sync_status = ?, server_id = COALESCE(?, server_id), updated_at = ?
     WHERE key = ?`,
    [status, serverId ?? null, Date.now(), key],
  );
}

/** Drops a row whose tombstone the server has acknowledged. */
async function hardDeleteOnlineCollection(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM online_collections WHERE key = ?", [key]);
}

/**
 * Writes a collection that arrived from the server.
 *
 * `ON CONFLICT DO NOTHING` rather than `INSERT OR REPLACE`: the caller only
 * reaches here for a key that is absent locally, and a replace on a key that
 * turned out to exist would take `download_state` with it — the one column that
 * describes *this* device and that the server has no opinion about.
 */
async function insertRemoteOnlineCollection(
  input: InsertRemoteOnlineCollectionInput,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO online_collections (
       key, server_id, source_id, external_id, title, subtitle, artwork_url,
       language_code, track_count, page_url, is_favorite, last_opened_at,
       download_state, deleted_at, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', NULL, 'synced', ?, ?)
     ON CONFLICT(key) DO NOTHING`,
    [
      input.key,
      input.serverId,
      input.sourceId,
      input.externalId,
      input.title,
      input.subtitle,
      input.artworkUrl,
      input.languageCode,
      input.trackCount,
      input.pageUrl,
      input.isFavorite ? 1 : 0,
      input.lastOpenedAt,
      now,
      input.updatedAt,
    ],
  );
}

/**
 * Applies a newer remote edit.
 *
 * `download_state` is deliberately absent: whether the audio is on this device
 * is not something another device can tell us.
 */
async function applyRemoteOnlineCollectionUpdate(
  update: OnlineCollectionUpdate,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE online_collections
     SET title = ?, subtitle = ?, artwork_url = ?, track_count = ?, page_url = ?,
         is_favorite = ?, last_opened_at = ?, server_id = ?,
         sync_status = 'synced', updated_at = ?
     WHERE key = ? AND deleted_at IS NULL`,
    [
      update.title,
      update.subtitle,
      update.artworkUrl,
      update.trackCount,
      update.pageUrl,
      update.isFavorite ? 1 : 0,
      update.lastOpenedAt,
      update.serverId,
      update.updatedAt,
      update.id,
    ],
  );
}

// --- Downloads ------------------------------------------------------------

/**
 * Replaces a collection's queue with one job per track.
 *
 * The whole queue is rewritten rather than appended to, because the source can
 * add, reorder or drop episodes and a stale job would otherwise download a file
 * that no longer exists at a position that no longer applies. Jobs already
 * finished are dropped with it — the files stay, and `markTrackDownloaded` is
 * what remembers them.
 */
async function replaceDownloadJobs(
  inputs: CreateDownloadJobInput[],
): Promise<LocalDownloadJob[]> {
  const db = await getDatabase();
  const now = Date.now();
  const collectionKey = inputs[0]?.collectionKey;
  if (!collectionKey) {
    return [];
  }
  await db.runAsync("DELETE FROM download_jobs WHERE collection_key = ?", [collectionKey]);
  for (const input of inputs) {
    await db.runAsync(
      `INSERT INTO download_jobs (
         id, collection_key, track_id, external_id, title, order_index, url,
         dest_path, state, bytes_total, bytes_done, attempts, error, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, 0, 0, NULL, ?, ?)`,
      [
        input.id ?? newId(),
        input.collectionKey,
        input.trackId,
        input.externalId,
        input.title,
        input.orderIndex,
        input.url,
        input.destPath,
        now,
        now,
      ],
    );
  }
  return getDownloadJobs(collectionKey);
}

async function getDownloadJobs(collectionKey: string): Promise<LocalDownloadJob[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadJobRow>(
    "SELECT * FROM download_jobs WHERE collection_key = ? ORDER BY order_index ASC",
    [collectionKey],
  );
  return rows.map(mapDownloadJob);
}

/**
 * The next job to run: the oldest one that has not finished.
 *
 * `running` is included because a kill leaves a row in that state with no
 * process behind it — treating it as work in progress would stall the queue
 * forever.
 */
async function getNextDownloadJob(collectionKey: string): Promise<LocalDownloadJob | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadJobRow>(
    `SELECT * FROM download_jobs
     WHERE collection_key = ? AND state IN ('queued', 'running')
     ORDER BY order_index ASC
     LIMIT 1`,
    [collectionKey],
  );
  return row ? mapDownloadJob(row) : null;
}

async function setDownloadJobState(
  id: string,
  state: LocalDownloadJob["state"],
  error?: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_jobs SET state = ?, error = ?, updated_at = ? WHERE id = ?",
    [state, error ?? null, Date.now(), id],
  );
}

async function updateDownloadJobProgress(
  id: string,
  bytesDone: number,
  bytesTotal: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_jobs SET bytes_done = ?, bytes_total = ?, updated_at = ? WHERE id = ?",
    [Math.max(0, Math.round(bytesDone)), Math.max(0, Math.round(bytesTotal)), Date.now(), id],
  );
}

async function incrementDownloadJobAttempts(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_jobs SET attempts = attempts + 1, updated_at = ? WHERE id = ?",
    [Date.now(), id],
  );
}

/** Where a collection's download has got to, counted from the job rows. */
export type DownloadProgress = {
  total: number;
  done: number;
  failed: number;
  bytesDone: number;
  bytesTotal: number;
};

async function getDownloadProgress(collectionKey: string): Promise<DownloadProgress> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    total: number;
    done: number;
    failed: number;
    bytes_done: number;
    bytes_total: number;
  }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(bytes_done) AS bytes_done,
            SUM(bytes_total) AS bytes_total
     FROM download_jobs WHERE collection_key = ?`,
    [collectionKey],
  );
  return {
    total: row?.total ?? 0,
    done: row?.done ?? 0,
    failed: row?.failed ?? 0,
    bytesDone: row?.bytes_done ?? 0,
    bytesTotal: row?.bytes_total ?? 0,
  };
}

/** The queue rows for one track, so a row can show its own progress. */
async function getDownloadJobsForTrack(trackId: string): Promise<LocalDownloadJob[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadJobRow>(
    "SELECT * FROM download_jobs WHERE track_id = ? ORDER BY order_index ASC",
    [trackId],
  );
  return rows.map(mapDownloadJob);
}

/** Marks every unfinished job in a collection as cancelled. */
async function cancelDownloadJobs(collectionKey: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE download_jobs SET state = 'cancelled', updated_at = ?
     WHERE collection_key = ? AND state IN ('queued', 'running')`,
    [Date.now(), collectionKey],
  );
}

/**
 * Drop a collection's queue outright, finished rows included.
 *
 * Unlike `cancelDownloadJobs`, which keeps the rows so a resume can pick up
 * where it left off, this is what "the download is gone" means: the files it
 * described have been deleted, so a row pointing at one is a row that would
 * offer to resume a download of something that is already gone.
 */
async function deleteDownloadJobs(collectionKey: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM download_jobs WHERE collection_key = ?", [collectionKey]);
}

/**
 * Runs through an online collection, newest first — the Continue tab's query.
 *
 * Deliberately not `getContextPlaysForHistory`: that one returns *closed* runs
 * and is shared with a screen whose limit is about pagination. Continue needs the
 * open run too — it is the whole point — and it needs it not to be crowded out
 * of a 200-row window by a listener who has spent a year in folders.
 */
async function getOnlineContextPlays(limit = 50): Promise<LocalContextPlay[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ContextPlayRow>(
    `SELECT * FROM context_plays
     WHERE context_type = 'online' AND deleted_at IS NULL
     ORDER BY started_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapContextPlay);
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
  markSessionSeeked,
  newStretchId,
  setSessionSyncStatus,
  softDeleteSession,
  softDeleteSessions,
  insertContextPlay,
  getContextPlayById,
  touchContextPlay,
  finalizeContextPlay,
  getOpenContextPlays,
  getContextRunProgress,
  getContextPlaysForHistory,
  getContextPlaysByKey,
  getOnlineContextPlays,
  getContextStats,
  getAllContextPlays,
  getPendingContextPlays,
  insertRemoteContextPlay,
  setContextPlaySyncStatus,
  softDeleteContextPlay,
  deleteContextPlay,
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
  upsertOnlineTrack,
  getTracksByCollection,
  getCollectionTrackProgress,
  setTrackDuration,
  markTrackDownloaded,
  upsertOnlineCollection,
  getOnlineCollection,
  getOnlineCollections,
  getFavoriteOnlineCollections,
  getDownloadingOnlineCollections,
  setOnlineCollectionFavorite,
  setOnlineCollectionDownloadState,
  touchOnlineCollectionOpened,
  softDeleteOnlineCollection,
  getPendingOnlineCollections,
  setOnlineCollectionSyncStatus,
  hardDeleteOnlineCollection,
  insertRemoteOnlineCollection,
  applyRemoteOnlineCollectionUpdate,
  replaceDownloadJobs,
  getDownloadJobs,
  getNextDownloadJob,
  setDownloadJobState,
  updateDownloadJobProgress,
  incrementDownloadJobAttempts,
  getDownloadProgress,
  getDownloadJobsForTrack,
  cancelDownloadJobs,
  getDownloadedTrackPaths,
  forgetDownloadedTracks,
  deleteDownloadJobs,
};
