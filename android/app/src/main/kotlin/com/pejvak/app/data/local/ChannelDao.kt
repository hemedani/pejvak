package com.pejvak.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * DAOs for the channel read-cache mirror (plan 07 §3). Reads come from Room; a pull
 * upserts server rows and prunes what it no longer sees. There is no sync-status
 * surface here — the phone never owns these rows (prompt D2).
 */
@Dao
interface ChannelDao {
    @Upsert
    suspend fun upsert(channel: ChannelEntity)

    @Upsert
    suspend fun upsertAll(channels: List<ChannelEntity>)

    @Query("SELECT * FROM channels ORDER BY cached_at DESC")
    fun observeAll(): Flow<List<ChannelEntity>>

    @Query("SELECT * FROM channels ORDER BY cached_at DESC")
    suspend fun getAll(): List<ChannelEntity>

    @Query("SELECT * FROM channels WHERE server_id = :serverId")
    suspend fun getByServerId(serverId: String): ChannelEntity?

    @Query("SELECT * FROM channels WHERE slug = :slug")
    suspend fun getBySlug(slug: String): ChannelEntity?

    @Query("DELETE FROM channels")
    suspend fun deleteAll()

    @Query("DELETE FROM channels WHERE server_id = :serverId")
    suspend fun deleteByServerId(serverId: String)

    /** Prune rows the current pull did not refresh (their `cached_at` stayed behind). */
    @Query("DELETE FROM channels WHERE cached_at < :since")
    suspend fun deleteNotCachedSince(since: Long)
}

@Dao
interface ChannelPlaylistDao {
    @Upsert
    suspend fun upsertAll(playlists: List<ChannelPlaylistEntity>)

    @Query("SELECT * FROM channel_playlists WHERE channel_server_id = :channelServerId ORDER BY sort_order ASC, server_id ASC")
    suspend fun getByChannel(channelServerId: String): List<ChannelPlaylistEntity>

    @Query("SELECT * FROM channel_playlists WHERE server_id = :serverId")
    suspend fun getByServerId(serverId: String): ChannelPlaylistEntity?

    @Query("DELETE FROM channel_playlists WHERE channel_server_id = :channelServerId")
    suspend fun deleteByChannel(channelServerId: String)

    @Query("DELETE FROM channel_playlists WHERE server_id = :serverId")
    suspend fun deleteByServerId(serverId: String)
}

@Dao
interface ChannelAudioDao {
    @Upsert
    suspend fun upsertAll(audios: List<ChannelAudioEntity>)

    @Upsert
    suspend fun upsert(audio: ChannelAudioEntity)

    @Query("SELECT * FROM channel_audios WHERE channel_server_id = :channelServerId ORDER BY position ASC, server_id ASC")
    suspend fun getByChannel(channelServerId: String): List<ChannelAudioEntity>

    @Query("SELECT * FROM channel_audios WHERE playlist_server_id = :playlistServerId ORDER BY position ASC, server_id ASC")
    suspend fun getByPlaylist(playlistServerId: String): List<ChannelAudioEntity>

    @Query("SELECT * FROM channel_audios WHERE content_hash = :contentHash LIMIT 1")
    suspend fun getByContentHash(contentHash: String): ChannelAudioEntity?

    @Query("SELECT * FROM channel_audios WHERE server_id = :serverId")
    suspend fun getByServerId(serverId: String): ChannelAudioEntity?

    @Query("DELETE FROM channel_audios WHERE channel_server_id = :channelServerId")
    suspend fun deleteByChannel(channelServerId: String)

    @Query("DELETE FROM channel_audios WHERE server_id = :serverId")
    suspend fun deleteByServerId(serverId: String)
}
