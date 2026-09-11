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
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);
