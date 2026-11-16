package com.pejvak.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "online_collections",
    indices = [
        Index(value = ["is_favorite", "updated_at"], orders = [Index.Order.ASC, Index.Order.DESC], name = "idx_online_collections_favorite"),
        Index(value = ["sync_status"], name = "idx_online_collections_sync"),
    ],
)
data class OnlineCollectionEntity(
    @PrimaryKey val key: String,
    val server_id: String?,
    val source_id: String,
    val external_id: String,
    val title: String,
    val subtitle: String?,
    val artwork_url: String?,
    val language_code: String,
    val track_count: Int = 0,
    val page_url: String?,
    val is_favorite: Boolean = false,
    val last_opened_at: Long?,
    val download_state: String = "none",
    val deleted_at: Long?,
    val sync_status: String = "pending",
    val created_at: Long,
    val updated_at: Long,
)

@Entity(
    tableName = "download_jobs",
    indices = [
        Index(value = ["collection_key", "order_index"], name = "idx_download_jobs_collection"),
        Index(value = ["state"], name = "idx_download_jobs_state"),
        Index(value = ["scope_key", "order_index"], name = "idx_download_jobs_scope"),
    ],
)
data class DownloadJobEntity(
    @PrimaryKey val id: String,
    val collection_key: String,
    val track_id: String,
    val external_id: String,
    val title: String,
    val order_index: Int = 0,
    val url: String,
    val dest_path: String,
    val state: String = "queued",
    val bytes_total: Long = 0,
    val bytes_done: Long = 0,
    val attempts: Int = 0,
    val error: String?,
    val created_at: Long,
    val updated_at: Long,
    val scope_key: String?,
)

@Entity(
    tableName = "download_scopes",
    indices = [
        Index(value = ["collection_key"], name = "idx_download_scopes_collection"),
        Index(value = ["download_state"], name = "idx_download_scopes_state"),
    ],
)
data class DownloadScopeEntity(
    @PrimaryKey val key: String,
    val collection_key: String,
    val kind: String,
    val title: String,
    val series_key: String?,
    val download_state: String = "none",
    val created_at: Long,
    val updated_at: Long,
)

@Entity(
    tableName = "download_files",
    primaryKeys = ["scope_key", "track_id"],
    indices = [
        Index(value = ["track_id"], name = "idx_download_files_track"),
        Index(value = ["folder_key", "track_number"], name = "idx_download_files_folder"),
    ],
)
data class DownloadFileEntity(
    val scope_key: String,
    val scope_kind: String,
    val track_id: String,
    val file_uri: String,
    val file_path: String,
    val file_size_bytes: Long = 0,
    val duration_sec: Int = 0,
    val folder_key: String,
    val folder_name: String,
    val track_number: Int = 0,
    val created_at: Long,
)