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
  {
    // Cover art extraction. `artwork_url` has existed since v1 but was never
    // written, because nothing read the picture out of the file.
    //
    // `artwork_checked_at` is what keeps the backfill finite. Without it, a file
    // that simply has no embedded picture is indistinguishable from one that has
    // not been looked at yet, so every pass would re-read the same rows forever.
    // It is deliberately *not* part of `LocalTrack`: it schedules work, and no
    // screen has any use for it.
    version: 7,
    up: [`ALTER TABLE tracks ADD COLUMN artwork_checked_at INTEGER`],
  },
  {
    // Listening history for whole collections.
    //
    // Until now a session only ever knew *which track* it was. That cannot say
    // "this playlist has been heard through three times", because a run through
    // a playlist is many sessions and nothing tied them together — and it
    // cannot answer "which folder was I in?" when a session is resumed, so
    // resuming a lecture dropped the listener into a queue of one.
    //
    // `context_plays` is the missing level: one row per *run* of a collection,
    // the same shape as a session one level up. A run starts when a queue that
    // belongs to a collection begins playing and ends when the queue runs out,
    // when playback moves to a different collection, or when recovery closes it
    // after a kill. `sessions.context_play_id` is the link down, and the two
    // denormalised columns beside it exist for the same reason
    // `sessions.content_hash` does — the History list reads 200 rows and should
    // not join to draw each one.
    //
    // `context_key` is a local playlist id or a folder key, and `context_title`
    // is captured at play time: a playlist can be renamed or deleted, and a
    // history entry that silently changed its name would be a worse record than
    // one that remembers what it was called.
    //
    // `track_count` is the size of the queue *when the run started*, so a run
    // can be read as "9 of 24" later. Completion is deliberately not judged
    // from it — `completed` means the queue genuinely ran out, which stays true
    // even if tracks were appended mid-run.
    //
    // There is deliberately no play counter on `playlists`. A stored count is a
    // second source of truth that has to be kept in step with these rows on
    // every device, and the first device to disagree would be wrong in a way
    // nobody could see. Counting runs is one indexed `GROUP BY`, and the
    // figures for a folder and for a playlist then come from the same code.
    version: 8,
    up: [
      `ALTER TABLE sessions ADD COLUMN context_play_id TEXT`,
      `ALTER TABLE sessions ADD COLUMN context_type TEXT`,
      `ALTER TABLE sessions ADD COLUMN context_key TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_context_play_id ON sessions(context_play_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_context_key ON sessions(context_type, context_key)`,
      `CREATE TABLE IF NOT EXISTS context_plays (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        context_type TEXT NOT NULL,
        context_key TEXT NOT NULL,
        context_title TEXT NOT NULL,
        track_count INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        last_index INTEGER NOT NULL DEFAULT 0,
        last_track_id TEXT,
        last_position_sec INTEGER NOT NULL DEFAULT 0,
        listened_sec INTEGER NOT NULL DEFAULT 0,
        finished_count INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        interrupted INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_context_plays_key ON context_plays(context_type, context_key)`,
      `CREATE INDEX IF NOT EXISTS idx_context_plays_started_at ON context_plays(started_at)`,
      `CREATE INDEX IF NOT EXISTS idx_context_plays_sync_status ON context_plays(sync_status)`,
      `CREATE INDEX IF NOT EXISTS idx_context_plays_deleted_at ON context_plays(deleted_at)`,
    ],
  },
  {
    // The run link has to survive a kill, exactly as the session does.
    //
    // `playback_checkpoints` is what lets a killed app still record what was
    // listened to; without the run id here, the session that recovery rebuilds
    // would come back as an orphan and the collection it belonged to would be
    // lost — the History entry would no longer say which book it was, and the
    // run's own listen time would quietly drop that stretch.
    //
    // A new version rather than another line in v8: v8 may already have been
    // applied on a device, and `ALTER TABLE ... ADD COLUMN` is not repeatable.
    version: 9,
    up: [`ALTER TABLE playback_checkpoints ADD COLUMN context_play_id TEXT`],
  },
  {
    // A session is one continuous *listen*, not one track.
    //
    // Scrubbing inside a track is not a change of what is being listened to, so
    // it must not cut the session; deliberately moving to another track is, so
    // it must. Automatic progression is neither — the listener is still on the
    // same stretch — which is what makes "heard from the first second of the
    // first track through to the end of the last" something the history can
    // point at rather than infer.
    //
    // The per-track row is untouched, because every derived figure in the app is
    // per track: the folder's "13 of 24 finished", where a track resumes, a
    // track's own play count. `stretch_id` only groups those rows — the
    // stretch's start track, end track and completeness are read off its members
    // rather than stored, so there is no second copy to keep in step.
    //
    // Backfilled to each row's own id, so every session already recorded becomes
    // a stretch of one, which is exactly what it was.
    version: 10,
    up: [
      // The stretch has to survive a kill for the same reason the run does:
      // recovery rebuilds only the track that was playing, and without the group
      // id that rebuilt row would read as a separate listen rather than as the
      // tail of one.
      `ALTER TABLE playback_checkpoints ADD COLUMN stretch_id TEXT`,
      `ALTER TABLE sessions ADD COLUMN stretch_id TEXT`,
      `ALTER TABLE sessions ADD COLUMN seeked INTEGER NOT NULL DEFAULT 0`,
      `UPDATE sessions SET stretch_id = id WHERE stretch_id IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_stretch ON sessions(stretch_id, started_at)`,
    ],
  },
  {
    // Online audio: streaming and downloading from a content source.
    //
    // An online item is an ordinary `tracks` row, not a parallel table. Every
    // derived figure in the app is per track — where playback resumes, what a
    // play count means, which rows a run groups — so a second table would mean a
    // second implementation of all of it, and the two would drift. `origin`
    // is what tells them apart, and `file_uri` stays the one column the player
    // reads: a local path for owned audio, the source's URL for a stream.
    //
    // `stream_url` is kept beside it rather than replacing it, because a
    // downloaded course has both: `file_uri` is where the bytes are now, and
    // `stream_url` is where they came from — which is what makes "play this
    // course from the source" possible without re-resolving the collection.
    //
    // The source's signed URLs expire, so `external_id` is the identity that
    // survives: `content_hash` is derived from it, never from the URL.
    version: 11,
    up: [
      `ALTER TABLE tracks ADD COLUMN origin TEXT NOT NULL DEFAULT 'local'`,
      `ALTER TABLE tracks ADD COLUMN stream_url TEXT`,
      `ALTER TABLE tracks ADD COLUMN source_id TEXT`,
      `ALTER TABLE tracks ADD COLUMN external_id TEXT`,
      `ALTER TABLE tracks ADD COLUMN collection_key TEXT`,
      `ALTER TABLE tracks ADD COLUMN collection_title TEXT`,
      `ALTER TABLE tracks ADD COLUMN downloaded_at INTEGER`,
      `ALTER TABLE tracks ADD COLUMN download_path TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_origin ON tracks(origin)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_online ON tracks(source_id, external_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_collection ON tracks(collection_key, track_number)`,
      // Saved and downloaded online collections.
      //
      // `key` is `sourceId:externalId` and is the row's identity, because that
      // is also what a run stores as `context_key` — so the collection a run
      // belongs to and the collection the listener saved are the same string and
      // cannot drift. `track_count` is what the source reported, used for the
      // card's "29 tracks"; the run's own denominator is captured separately.
      //
      // `page_url` is the collection's address on the source's site. Kept so a
      // downloaded course can always be traced back to where it came from, which
      // is the whole reason the listener is allowed to download it.
      `CREATE TABLE IF NOT EXISTS online_collections (
        key TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        source_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        artwork_url TEXT,
        language_code TEXT NOT NULL,
        track_count INTEGER NOT NULL DEFAULT 0,
        page_url TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        last_opened_at INTEGER,
        download_state TEXT NOT NULL DEFAULT 'none',
        deleted_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_online_collections_favorite
         ON online_collections(is_favorite, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_online_collections_sync
         ON online_collections(sync_status)`,
      // The download queue, as rows rather than in memory.
      //
      // A course is tens of files and tens of megabytes: the listener will
      // background the app, lose signal, or kill it outright, and a queue that
      // only existed in JS would restart from zero every time. One row per track
      // means progress is `COUNT(state = 'done')`, a retry is a state change, and
      // an interrupted run resumes from the first row that is not done.
      `CREATE TABLE IF NOT EXISTS download_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        collection_key TEXT NOT NULL,
        track_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        url TEXT NOT NULL,
        dest_path TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued',
        bytes_total INTEGER NOT NULL DEFAULT 0,
        bytes_done INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_download_jobs_collection
         ON download_jobs(collection_key, order_index)`,
      `CREATE INDEX IF NOT EXISTS idx_download_jobs_state ON download_jobs(state)`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);
