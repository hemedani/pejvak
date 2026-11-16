package com.pejvak.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entities mirror the RN SQLite schema 1:1 (mobile/src/lib/db/migrations.ts).
 * Property names match the DB columns exactly; positions/durations are integer
 * seconds, timestamps epoch millis, booleans INTEGER 0/1, enums stored as their
 * wire string. Mappers (Mappers.kt) convert to the camelCase domain models.
 */
@Entity(
    tableName = "tracks",
    indices = [
        Index(value = ["content_hash"], unique = true, name = "idx_tracks_content_hash"),
        Index(value = ["sync_status"], name = "idx_tracks_sync_status"),
        Index(value = ["folder_key"], name = "idx_tracks_folder_key"),
        Index(value = ["source_path"], name = "idx_tracks_source_path"),
        Index(value = ["origin"], name = "idx_tracks_origin"),
        Index(value = ["source_id", "external_id"], name = "idx_tracks_online"),
        Index(value = ["collection_key", "track_number"], name = "idx_tracks_collection"),
    ],
)
data class TrackEntity(
    @PrimaryKey val id: String,
    val server_id: String?,
    val content_hash: String,
    val title: String,
    val file_name: String?,
    val file_uri: String?,
    val duration_sec: Int = 0,
    val file_size_bytes: Long = 0,
    val mime_type: String?,
    val is_audiobook: Boolean = false,
    val author: String?,
    val narrator: String?,
    val artwork_url: String?,
    val total_play_count: Int = 0,
    val total_listen_time_sec: Int = 0,
    val last_played_at: Long?,
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
    val source: String?,
    val source_uri: String?,
    val source_path: String?,
    val source_size: Long?,
    val source_mtime: Long?,
    val folder_key: String?,
    val folder_name: String?,
    val album: String?,
    val track_number: Int?,
    val disc_number: Int?,
    val year: Int?,
    val availability: String = "present",
    val artwork_checked_at: Long?,
    val origin: String = "local",
    val stream_url: String?,
    val source_id: String?,
    val external_id: String?,
    val collection_key: String?,
    val collection_title: String?,
    val downloaded_at: Long?,
    val download_path: String?,
)

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val key: String,
    val name: String,
    val tree_uri: String?,
    val added_at: Long,
    val last_played_at: Long?,
)