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
    ],
    version = 2,
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
