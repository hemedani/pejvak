package com.pejvak.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Offline-first source of truth. The schema mirrors the RN SQLite database 1:1
 * (mobile/src/lib/db/migrations.ts v1–12): 12 tables, integer seconds, epoch-millis
 * timestamps, sync columns on every syncable table. Version 1 here is the native
 * baseline; the RN migration history is collapsed into this single schema because
 * the native app starts fresh (history is restored from the server via login+sync).
 */
@Database(
    entities = [
        TrackEntity::class,
        SessionEntity::class,
        AnnotationEntity::class,
        PlaylistEntity::class,
        CheckpointEntity::class,
        SettingsEntity::class,
        FolderEntity::class,
        ContextPlayEntity::class,
        OnlineCollectionEntity::class,
        DownloadJobEntity::class,
        DownloadScopeEntity::class,
        DownloadFileEntity::class,
        ChannelEntity::class,
        ChannelPlaylistEntity::class,
        ChannelAudioEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class PejvakDatabase : RoomDatabase() {
    abstract fun trackDao(): TrackDao
    abstract fun sessionDao(): SessionDao
    abstract fun annotationDao(): AnnotationDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun checkpointDao(): CheckpointDao
    abstract fun settingsDao(): SettingsDao
    abstract fun folderDao(): FolderDao
    abstract fun contextPlayDao(): ContextPlayDao
    abstract fun onlineCollectionDao(): OnlineCollectionDao
    abstract fun downloadJobDao(): DownloadJobDao
    abstract fun downloadScopeDao(): DownloadScopeDao
    abstract fun downloadFileDao(): DownloadFileDao
    abstract fun channelDao(): ChannelDao
    abstract fun channelPlaylistDao(): ChannelPlaylistDao
    abstract fun channelAudioDao(): ChannelAudioDao
}

/**
 * v2 adds the playback-context snapshot to sessions. Every column is nullable and
 * has no SQL default, so a legacy row stays NULL and the mapper can tell it apart
 * from a new row that genuinely used no ambience or full volume.
 */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE sessions ADD COLUMN context_title TEXT")
        db.execSQL("ALTER TABLE sessions ADD COLUMN collection_sort TEXT")
        db.execSQL("ALTER TABLE sessions ADD COLUMN collection_sort_direction TEXT")
        db.execSQL("ALTER TABLE sessions ADD COLUMN collection_index INTEGER")
        db.execSQL("ALTER TABLE sessions ADD COLUMN collection_size INTEGER")
        db.execSQL("ALTER TABLE sessions ADD COLUMN ambient_tone TEXT")
        db.execSQL("ALTER TABLE sessions ADD COLUMN ambient_level INTEGER")
        db.execSQL("ALTER TABLE sessions ADD COLUMN volume_percent INTEGER")
        db.execSQL("ALTER TABLE sessions ADD COLUMN enhancer_enabled INTEGER")
        db.execSQL("ALTER TABLE sessions ADD COLUMN enhancer_boost_db REAL")
        db.execSQL("ALTER TABLE sessions ADD COLUMN enhancer_bass_db REAL")
        db.execSQL("ALTER TABLE sessions ADD COLUMN enhancer_treble_db REAL")
    }
}

/**
 * v3 adds the Listener Channels read-cache mirror (plan 07 §3): three tables that
 * mirror the server's `channel` / `channelPlaylist` / `channelAudio` rows. They carry
 * no `sync_status` — the phone is a consumer, never the owner (prompt D2) — just the
 * mirrored fields plus `is_mine` (resolved from the session at pull time) and
 * `cached_at` for pruning.
 */
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `channels` (" +
                "`server_id` TEXT NOT NULL, `slug` TEXT NOT NULL, `name` TEXT NOT NULL, `bio` TEXT, " +
                "`categories` TEXT NOT NULL, `language_code` TEXT, `avatar_url` TEXT, `gallery` TEXT NOT NULL, " +
                "`donation_url` TEXT, `website_url` TEXT, `socials` TEXT NOT NULL, `contact_email` TEXT, " +
                "`status` TEXT NOT NULL, `audio_count` INTEGER NOT NULL, `playlist_count` INTEGER NOT NULL, " +
                "`creator_id` TEXT, `creator_username` TEXT, `creator_display_name` TEXT, `creator_avatar_url` TEXT, " +
                "`is_mine` INTEGER NOT NULL, `cached_at` INTEGER NOT NULL, `created_at` INTEGER, `updated_at` INTEGER, " +
                "PRIMARY KEY(`server_id`))",
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channels_status` ON `channels` (`status`)")
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channels_cached` ON `channels` (`cached_at`)")

        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `channel_playlists` (" +
                "`server_id` TEXT NOT NULL, `channel_server_id` TEXT NOT NULL, `title` TEXT NOT NULL, " +
                "`description` TEXT, `category` TEXT, `tags` TEXT NOT NULL, `sort_order` INTEGER NOT NULL, " +
                "`audio_count` INTEGER NOT NULL, `is_mine` INTEGER NOT NULL, `cached_at` INTEGER NOT NULL, " +
                "PRIMARY KEY(`server_id`))",
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channel_playlists_channel` ON `channel_playlists` (`channel_server_id`, `sort_order`)")

        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `channel_audios` (" +
                "`server_id` TEXT NOT NULL, `channel_server_id` TEXT NOT NULL, `playlist_server_id` TEXT, " +
                "`content_hash` TEXT NOT NULL, `title` TEXT NOT NULL, `description` TEXT, `category` TEXT, " +
                "`tags` TEXT NOT NULL, `audio_url` TEXT NOT NULL, `duration_sec` INTEGER NOT NULL, " +
                "`file_size_bytes` INTEGER NOT NULL, `mime_type` TEXT, `is_audiobook` INTEGER NOT NULL, " +
                "`author` TEXT, `narrator` TEXT, `artwork_url` TEXT, `position` INTEGER NOT NULL, " +
                "`language_code` TEXT, `status` TEXT NOT NULL, `download_state` TEXT NOT NULL, " +
                "`is_mine` INTEGER NOT NULL, `cached_at` INTEGER NOT NULL, PRIMARY KEY(`server_id`))",
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channel_audios_channel` ON `channel_audios` (`channel_server_id`)")
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channel_audios_playlist` ON `channel_audios` (`playlist_server_id`)")
        db.execSQL("CREATE INDEX IF NOT EXISTS `idx_channel_audios_hash` ON `channel_audios` (`content_hash`)")
    }
}

/**
 * v4 adds the offline-download fields to the channel episode mirror (plan 07 CHAN-U05):
 * `local_path` is the on-device file once the audio is downloaded for offline play
 * (`download_state` already existed). Both are device-only mirror state — the download
 * is not server-owned and never enters `syncLocalData` (prompt D2).
 */
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE channel_audios ADD COLUMN `local_path` TEXT")
    }
}
