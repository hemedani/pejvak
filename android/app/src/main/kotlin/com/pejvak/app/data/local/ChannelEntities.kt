package com.pejvak.app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Read-cache mirrors of the server's channel rows (plan 07 §3). The source of truth
 * is the server; these rows are never in the `syncLocalData` push queue (prompt D2) —
 * hence no `sync_status` column. Each carries `is_mine` (resolved from the session at
 * pull time) and `cached_at` (epoch millis) so a stale mirror can be pruned.
 *
 * List fields (`categories`, `gallery`, `socials`, `tags`) are stored as JSON text,
 * decoded in `Mappers.kt`, the same convention as `annotations.tags` and
 * `playlists.items`.
 */
@Entity(
    tableName = "channels",
    indices = [
        Index(value = ["status"], name = "idx_channels_status"),
        Index(value = ["cached_at"], name = "idx_channels_cached"),
    ],
)
data class ChannelEntity(
    @PrimaryKey @ColumnInfo(name = "server_id") val serverId: String,
    @ColumnInfo(name = "slug") val slug: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "bio") val bio: String?,
    @ColumnInfo(name = "categories") val categories: String,
    @ColumnInfo(name = "language_code") val languageCode: String?,
    @ColumnInfo(name = "avatar_url") val avatarUrl: String?,
    @ColumnInfo(name = "gallery") val gallery: String,
    @ColumnInfo(name = "donation_url") val donationUrl: String?,
    @ColumnInfo(name = "website_url") val websiteUrl: String?,
    @ColumnInfo(name = "socials") val socials: String,
    @ColumnInfo(name = "contact_email") val contactEmail: String?,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "audio_count") val audioCount: Int,
    @ColumnInfo(name = "playlist_count") val playlistCount: Int,
    @ColumnInfo(name = "creator_id") val creatorId: String?,
    @ColumnInfo(name = "creator_username") val creatorUsername: String?,
    @ColumnInfo(name = "creator_display_name") val creatorDisplayName: String?,
    @ColumnInfo(name = "creator_avatar_url") val creatorAvatarUrl: String?,
    @ColumnInfo(name = "is_mine") val isMine: Boolean,
    @ColumnInfo(name = "cached_at") val cachedAt: Long,
    @ColumnInfo(name = "created_at") val createdAt: Long?,
    @ColumnInfo(name = "updated_at") val updatedAt: Long?,
)

@Entity(
    tableName = "channel_playlists",
    indices = [
        Index(value = ["channel_server_id", "sort_order"], name = "idx_channel_playlists_channel"),
    ],
)
data class ChannelPlaylistEntity(
    @PrimaryKey @ColumnInfo(name = "server_id") val serverId: String,
    @ColumnInfo(name = "channel_server_id") val channelServerId: String,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "description") val description: String?,
    @ColumnInfo(name = "category") val category: String?,
    @ColumnInfo(name = "tags") val tags: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "audio_count") val audioCount: Int,
    @ColumnInfo(name = "is_mine") val isMine: Boolean,
    @ColumnInfo(name = "cached_at") val cachedAt: Long,
)

@Entity(
    tableName = "channel_audios",
    indices = [
        Index(value = ["channel_server_id"], name = "idx_channel_audios_channel"),
        Index(value = ["playlist_server_id"], name = "idx_channel_audios_playlist"),
        Index(value = ["content_hash"], name = "idx_channel_audios_hash"),
    ],
)
data class ChannelAudioEntity(
    @PrimaryKey @ColumnInfo(name = "server_id") val serverId: String,
    @ColumnInfo(name = "channel_server_id") val channelServerId: String,
    @ColumnInfo(name = "playlist_server_id") val playlistServerId: String?,
    @ColumnInfo(name = "content_hash") val contentHash: String,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "description") val description: String?,
    @ColumnInfo(name = "category") val category: String?,
    @ColumnInfo(name = "tags") val tags: String,
    @ColumnInfo(name = "audio_url") val audioUrl: String,
    @ColumnInfo(name = "duration_sec") val durationSec: Int,
    @ColumnInfo(name = "file_size_bytes") val fileSizeBytes: Long,
    @ColumnInfo(name = "mime_type") val mimeType: String?,
    @ColumnInfo(name = "is_audiobook") val isAudiobook: Boolean,
    @ColumnInfo(name = "author") val author: String?,
    @ColumnInfo(name = "narrator") val narrator: String?,
    @ColumnInfo(name = "artwork_url") val artworkUrl: String?,
    @ColumnInfo(name = "position") val position: Int,
    @ColumnInfo(name = "language_code") val languageCode: String?,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "download_state") val downloadState: String,
    @ColumnInfo(name = "is_mine") val isMine: Boolean,
    @ColumnInfo(name = "cached_at") val cachedAt: Long,
)
