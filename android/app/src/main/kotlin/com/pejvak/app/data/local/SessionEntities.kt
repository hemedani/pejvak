package com.pejvak.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sessions",
    indices = [
        Index(value = ["track_id"], name = "idx_sessions_track_id"),
        Index(value = ["sync_status"], name = "idx_sessions_sync_status"),
        Index(value = ["deleted_at"], name = "idx_sessions_deleted_at"),
        Index(value = ["context_play_id"], name = "idx_sessions_context_play_id"),
        Index(value = ["context_type", "context_key"], name = "idx_sessions_context_key"),
        Index(value = ["stretch_id", "started_at"], name = "idx_sessions_stretch"),
    ],
)
data class SessionEntity(
    @PrimaryKey val id: String,
    val server_id: String?,
    val track_id: String,
    val content_hash: String,
    val started_at: Long,
    val ended_at: Long?,
    val start_position_sec: Int = 0,
    val end_position_sec: Int?,
    val duration_listened_sec: Int = 0,
    val playback_speed: Double = 1.0,
    val completed: Boolean = false,
    val interrupted: Boolean = false,
    val device_info: String?,
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
    val deleted_at: Long?,
    val context_play_id: String?,
    val context_type: String?,
    val context_key: String?,
    val stretch_id: String,
    val seeked: Boolean = false,
    val context_title: String?,
    val collection_sort: String?,
    val collection_sort_direction: String?,
    val collection_index: Int?,
    val collection_size: Int?,
    val ambient_tone: String?,
    val ambient_level: Int?,
    val volume_percent: Int?,
    val enhancer_enabled: Boolean?,
    val enhancer_boost_db: Double?,
    val enhancer_bass_db: Double?,
    val enhancer_treble_db: Double?,
)

/** Local-only kill-recovery checkpoint; never synced. */
@Entity(
    tableName = "playback_checkpoints",
    indices = [Index(value = ["session_id"], name = "idx_checkpoints_session_id")],
)
data class CheckpointEntity(
    @PrimaryKey val id: String,
    val session_id: String,
    val track_id: String,
    val content_hash: String,
    val position_sec: Int,
    val last_position_sec: Int,
    val duration_listened_sec: Int = 0,
    val playback_speed: Double = 1.0,
    val started_at: Long,
    val timestamp: Long,
    val device_info: String?,
    val context_play_id: String?,
    val stretch_id: String?,
)

/** One run through a collection (playlist/folder/online). */
@Entity(
    tableName = "context_plays",
    indices = [
        Index(value = ["context_type", "context_key"], name = "idx_context_plays_key"),
        Index(value = ["started_at"], name = "idx_context_plays_started_at"),
        Index(value = ["sync_status"], name = "idx_context_plays_sync_status"),
        Index(value = ["deleted_at"], name = "idx_context_plays_deleted_at"),
    ],
)
data class ContextPlayEntity(
    @PrimaryKey val id: String,
    val server_id: String?,
    val context_type: String,
    val context_key: String,
    val context_title: String,
    val track_count: Int = 0,
    val started_at: Long,
    val ended_at: Long?,
    val last_index: Int = 0,
    val last_track_id: String?,
    val last_position_sec: Int = 0,
    val listened_sec: Int = 0,
    val finished_count: Int = 0,
    val completed: Boolean = false,
    val interrupted: Boolean = false,
    val deleted_at: Long?,
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
)