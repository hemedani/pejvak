package com.pejvak.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface AnnotationDao {
    @Upsert
    suspend fun upsert(annotation: AnnotationEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(annotation: AnnotationEntity): Long

    @Query("SELECT * FROM annotations WHERE id = :id")
    suspend fun getById(id: String): AnnotationEntity?

    @Query("SELECT * FROM annotations WHERE track_id = :trackId AND deleted_at IS NULL ORDER BY position_sec")
    suspend fun getForTrack(trackId: String): List<AnnotationEntity>

    @Query("SELECT * FROM annotations WHERE track_id = :trackId AND deleted_at IS NULL ORDER BY position_sec")
    fun observeForTrack(trackId: String): Flow<List<AnnotationEntity>>

    @Query("SELECT * FROM annotations WHERE deleted_at IS NULL ORDER BY updated_at DESC")
    fun observeLive(): Flow<List<AnnotationEntity>>

    @Query("SELECT * FROM annotations WHERE deleted_at IS NULL")
    suspend fun getLive(): List<AnnotationEntity>

    @Query("SELECT COUNT(*) FROM annotations WHERE track_id = :trackId AND deleted_at IS NULL")
    suspend fun countForTrack(trackId: String): Int

    @Query("SELECT track_id, COUNT(*) AS noteCount FROM annotations WHERE deleted_at IS NULL AND track_id IN (:trackIds) GROUP BY track_id")
    suspend fun countsForTracks(trackIds: List<String>): List<TrackAnnotationCount>

    @Query("SELECT * FROM annotations WHERE sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<AnnotationEntity>

    @Query("SELECT * FROM annotations WHERE sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<AnnotationEntity>

    @Query("SELECT * FROM annotations")
    suspend fun getAll(): List<AnnotationEntity>

    @Query("UPDATE annotations SET text = :text, tags = :tags, color = :color, updated_at = :updatedAt, server_id = :serverId, sync_status = 'synced' WHERE id = :id")
    suspend fun applyRemoteUpdate(id: String, text: String, tags: String, color: String?, updatedAt: Long, serverId: String)

    @Query("UPDATE annotations SET sync_status = 'synced', server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)

    @Query("UPDATE annotations SET sync_status = :status WHERE id = :id")
    suspend fun setSyncStatus(id: String, status: String)

    /** SRV-02: after an endpoint move, re-queue everything the old server acknowledged. */
    @Query("UPDATE annotations SET sync_status = 'pending' WHERE sync_status = 'synced'")
    suspend fun requeueSynced()

    @Query("UPDATE annotations SET deleted_at = :at, sync_status = 'pending' WHERE id = :id")
    suspend fun softDelete(id: String, at: Long)

    @Query("DELETE FROM annotations WHERE id = :id")
    suspend fun hardDelete(id: String)
}

@Dao
interface PlaylistDao {
    @Upsert
    suspend fun upsert(playlist: PlaylistEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(playlist: PlaylistEntity): Long

    @Query("SELECT * FROM playlists WHERE id = :id")
    suspend fun getById(id: String): PlaylistEntity?

    @Query("SELECT * FROM playlists WHERE deleted_at IS NULL ORDER BY updated_at DESC")
    fun observeLive(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists WHERE deleted_at IS NULL")
    suspend fun getLive(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<PlaylistEntity>

    @Query("SELECT * FROM playlists")
    suspend fun getAll(): List<PlaylistEntity>

    @Query("UPDATE playlists SET title = :title, description = :description, is_public = :isPublic, items = :items, updated_at = :updatedAt, server_id = :serverId, sync_status = 'synced' WHERE id = :id")
    suspend fun applyRemoteUpdate(id: String, title: String, description: String?, isPublic: Boolean, items: String, updatedAt: Long, serverId: String)

    @Query("UPDATE playlists SET sync_status = 'synced', server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)

    @Query("UPDATE playlists SET sync_status = :status WHERE id = :id")
    suspend fun setSyncStatus(id: String, status: String)

    /** SRV-02: after an endpoint move, re-queue everything the old server acknowledged. */
    @Query("UPDATE playlists SET sync_status = 'pending' WHERE sync_status = 'synced'")
    suspend fun requeueSynced()

    @Query("UPDATE playlists SET deleted_at = :at, sync_status = 'pending' WHERE id = :id")
    suspend fun softDelete(id: String, at: Long)

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun hardDelete(id: String)
}