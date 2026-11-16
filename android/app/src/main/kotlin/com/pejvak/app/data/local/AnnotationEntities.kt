package com.pejvak.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "annotations",
    indices = [
        Index(value = ["track_id"], name = "idx_annotations_track_id"),
        Index(value = ["sync_status"], name = "idx_annotations_sync_status"),
        Index(value = ["deleted_at"], name = "idx_annotations_deleted_at"),
    ],
)
data class AnnotationEntity(
    @PrimaryKey val id: String,
    val server_id: String?,
    val track_id: String,
    val content_hash: String,
    val position_sec: Int,
    val text: String,
    val tags: String = "[]",
    val color: String?,
    val times_played_before: Int = 0,
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
    val deleted_at: Long?,
)

@Entity(
    tableName = "playlists",
    indices = [
        Index(value = ["sync_status"], name = "idx_playlists_sync_status"),
        Index(value = ["deleted_at"], name = "idx_playlists_deleted_at"),
    ],
)
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val server_id: String?,
    val title: String,
    val description: String?,
    val is_public: Boolean = false,
    val items: String = "[]",
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
    val deleted_at: Long?,
)