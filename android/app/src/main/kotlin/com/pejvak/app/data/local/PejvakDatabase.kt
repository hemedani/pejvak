package com.pejvak.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

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
    version = 1,
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