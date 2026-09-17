export type Migration = {
  version: number;
  up: string[];
};

/**
 * Append-only list of schema migrations. `version` must increase by one each
 * time; applied versions are tracked in SQLite's `PRAGMA user_version`.
 *
 * All positions and durations are integer seconds (never floats). `playback_speed`
 * is the one non-second numeric and is stored as REAL (0.5x-3.0x).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        content_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        file_name TEXT,
        file_uri TEXT,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT,
        is_audiobook INTEGER NOT NULL DEFAULT 0,
        author TEXT,
        narrator TEXT,
        artwork_url TEXT,
        total_play_count INTEGER NOT NULL DEFAULT 0,
        total_listen_time_sec INTEGER NOT NULL DEFAULT 0,
        last_played_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_content_hash ON tracks(content_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_sync_status ON tracks(sync_status)`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        track_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        start_position_sec INTEGER NOT NULL DEFAULT 0,
        end_position_sec INTEGER,
        duration_listened_sec INTEGER NOT NULL DEFAULT 0,
        playback_speed REAL NOT NULL DEFAULT 1,
        completed INTEGER NOT NULL DEFAULT 0,
        interrupted INTEGER NOT NULL DEFAULT 0,
        device_info TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_track_id ON sessions(track_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_sync_status ON sessions(sync_status)`,
      `CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        track_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        position_sec INTEGER NOT NULL,
        text TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        color TEXT,
        times_played_before INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_annotations_track_id ON annotations(track_id)`,
      `CREATE INDEX IF NOT EXISTS idx_annotations_sync_status ON annotations(sync_status)`,
      `CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        items TEXT NOT NULL DEFAULT '[]',
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_playlists_sync_status ON playlists(sync_status)`,
      `CREATE TABLE IF NOT EXISTS playback_checkpoints (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        position_sec INTEGER NOT NULL,
        last_position_sec INTEGER NOT NULL,
        duration_listened_sec INTEGER NOT NULL DEFAULT 0,
        playback_speed REAL NOT NULL DEFAULT 1,
        started_at INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        device_info TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_checkpoints_session_id ON playback_checkpoints(session_id)`,
    ],
  },
  {
    version: 2,
    up: [
      `ALTER TABLE annotations ADD COLUMN deleted_at INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_annotations_deleted_at ON annotations(deleted_at)`,
    ],
  },
  {
    version: 3,
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 4,
    up: [
      `ALTER TABLE playlists ADD COLUMN deleted_at INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_playlists_deleted_at ON playlists(deleted_at)`,
    ],
  },
  {
    // Removing a history entry has to be a tombstone, not a DELETE. Sessions
    // sync up and are pulled back by `getMyListeningHistory`, and
    // `insertRemoteSession` uses INSERT OR IGNORE keyed on the client id — so a
    // hard-deleted session is simply re-inserted by the next pull. Keeping the
    // row and hiding it is the only durable removal.
    version: 5,
    up: [
      `ALTER TABLE sessions ADD COLUMN deleted_at INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at ON sessions(deleted_at)`,
    ],
  },
  {
    // Device import. Tracks are no longer necessarily *owned* by the app: a
    // device-scanned track is referenced in place by URI, so the columns below
    // record where it came from and what it looked like when we last hashed it.
    //
    // `source_size` + `source_mtime` are the rescan key. Phase 2 of a scan only
    // reads files whose (size, mtime) pair changed, so re-scanning a 300-file
    // library costs zero file reads. That is also why they are nullable: a
    // legacy copied track has no device-side original to compare against.
    //
    // `folder_key` is a normalised, root-stripped path ('Lectures/Physics'), not
    // a real filesystem path, so it survives a move between storage volumes.
    version: 6,
    up: [
      `ALTER TABLE tracks ADD COLUMN source TEXT`,
      `ALTER TABLE tracks ADD COLUMN source_uri TEXT`,
      `ALTER TABLE tracks ADD COLUMN source_path TEXT`,
      `ALTER TABLE tracks ADD COLUMN source_size INTEGER`,
      `ALTER TABLE tracks ADD COLUMN source_mtime INTEGER`,
      `ALTER TABLE tracks ADD COLUMN folder_key TEXT`,
      `ALTER TABLE tracks ADD COLUMN folder_name TEXT`,
      `ALTER TABLE tracks ADD COLUMN album TEXT`,
      `ALTER TABLE tracks ADD COLUMN track_number INTEGER`,
      `ALTER TABLE tracks ADD COLUMN disc_number INTEGER`,
      `ALTER TABLE tracks ADD COLUMN year INTEGER`,
      `ALTER TABLE tracks ADD COLUMN availability TEXT NOT NULL DEFAULT 'present'`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_folder_key ON tracks(folder_key)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_source_path ON tracks(source_path)`,
      // A SAF tree grant has to outlive the scan that created it, otherwise
      // folder play breaks on every relaunch. `tree_uri` is that persisted
      // grant; `track_count` is deliberately *not* stored, it is counted from
      // `tracks.folder_key` so the two can never drift apart.
      `CREATE TABLE IF NOT EXISTS folders (
        key TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        tree_uri TEXT,
        added_at INTEGER NOT NULL,
        last_played_at INTEGER
      )`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);
