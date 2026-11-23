package com.pejvak.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface OnlineCollectionDao {
    @Upsert
    suspend fun upsert(collection: OnlineCollectionEntity)

    // Remote insert never replaces: download_state describes THIS device only.
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(collection: OnlineCollectionEntity): Long

    @Query("SELECT * FROM online_collections WHERE `key` = :key")
    suspend fun getByKey(key: String): OnlineCollectionEntity?

    @Query("SELECT * FROM online_collections WHERE is_favorite = 1 AND deleted_at IS NULL ORDER BY updated_at DESC")
    fun observeFavorites(): Flow<List<OnlineCollectionEntity>>

    @Query("SELECT * FROM online_collections WHERE deleted_at IS NULL ORDER BY updated_at DESC")
    fun observeLive(): Flow<List<OnlineCollectionEntity>>

    @Query("SELECT * FROM online_collections WHERE deleted_at IS NULL AND download_state = 'downloading' ORDER BY updated_at ASC")
    suspend fun getDownloading(): List<OnlineCollectionEntity>

    @Query("SELECT * FROM online_collections WHERE deleted_at IS NULL")
    suspend fun getLive(): List<OnlineCollectionEntity>

    @Query("SELECT * FROM online_collections WHERE sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<OnlineCollectionEntity>

    @Query("SELECT * FROM online_collections WHERE sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<OnlineCollectionEntity>

    @Query("SELECT * FROM online_collections")
    suspend fun getAll(): List<OnlineCollectionEntity>

    @Query("UPDATE online_collections SET sync_status = :status WHERE `key` = :key")
    suspend fun setSyncStatus(key: String, status: String)

    @Query(
        "UPDATE online_collections SET title = :title, subtitle = :subtitle, artwork_url = :artworkUrl, " +
            "track_count = :trackCount, page_url = :pageUrl, is_favorite = :isFavorite, last_opened_at = :lastOpenedAt, " +
            "updated_at = :updatedAt, server_id = :serverId, sync_status = 'synced' WHERE `key` = :key",
    )
    suspend fun applyRemoteUpdate(
        key: String, title: String, subtitle: String?, artworkUrl: String?, trackCount: Int,
        pageUrl: String?, isFavorite: Boolean, lastOpenedAt: Long?, updatedAt: Long, serverId: String,
    )

    @Query("UPDATE online_collections SET sync_status = 'synced', server_id = :serverId WHERE `key` = :key")
    suspend fun markSynced(key: String, serverId: String)

    /** SRV-02: after an endpoint move, re-queue everything the old server acknowledged. */
    @Query("UPDATE online_collections SET sync_status = 'pending' WHERE sync_status = 'synced'")
    suspend fun requeueSynced()

    @Query("UPDATE online_collections SET is_favorite = :favorite, sync_status = 'pending', updated_at = :at WHERE `key` = :key")
    suspend fun setFavorite(key: String, favorite: Boolean, at: Long)

    @Query("UPDATE online_collections SET download_state = :state, updated_at = :at WHERE `key` = :key")
    suspend fun setDownloadState(key: String, state: String, at: Long)

    @Query("UPDATE online_collections SET last_opened_at = :at, sync_status = 'pending', updated_at = :at WHERE `key` = :key")
    suspend fun markOpened(key: String, at: Long)

    @Query("UPDATE online_collections SET deleted_at = :at, sync_status = 'pending' WHERE `key` = :key")
    suspend fun softDelete(key: String, at: Long)

    @Query("DELETE FROM online_collections WHERE `key` = :key")
    suspend fun hardDelete(key: String)
}

@Dao
interface DownloadJobDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(jobs: List<DownloadJobEntity>)

    @Query("SELECT * FROM download_jobs WHERE collection_key = :collectionKey ORDER BY order_index")
    suspend fun getByCollection(collectionKey: String): List<DownloadJobEntity>

    @Query("SELECT * FROM download_jobs WHERE scope_key = :scopeKey ORDER BY order_index")
    suspend fun getByScope(scopeKey: String): List<DownloadJobEntity>

    @Query("SELECT * FROM download_jobs WHERE scope_key = :scopeKey AND state IN ('queued','running') ORDER BY order_index LIMIT 1")
    suspend fun getNext(scopeKey: String): DownloadJobEntity?

    @Query(
        "SELECT COUNT(*) AS total, " +
            "COALESCE(SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END), 0) AS done, " +
            "COALESCE(SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END), 0) AS failed, " +
            "COALESCE(SUM(bytes_done), 0) AS bytesDone, COALESCE(SUM(bytes_total), 0) AS bytesTotal " +
            "FROM download_jobs WHERE scope_key = :scopeKey",
    )
    suspend fun progressForScope(scopeKey: String): DownloadProgressRow

    @Query("UPDATE download_jobs SET state = 'cancelled', updated_at = :at WHERE scope_key = :scopeKey AND state IN ('queued','running')")
    suspend fun cancelActive(scopeKey: String, at: Long)

    @Query("UPDATE download_jobs SET state = 'queued', error = NULL, updated_at = :at WHERE scope_key = :scopeKey AND state IN ('failed','cancelled')")
    suspend fun requeueFailed(scopeKey: String, at: Long): Int

    @Query("UPDATE download_jobs SET state = :state, error = :error, updated_at = :at WHERE id = :id")
    suspend fun setState(id: String, state: String, error: String?, at: Long)

    @Query("UPDATE download_jobs SET bytes_done = :bytesDone, bytes_total = :bytesTotal, updated_at = :at WHERE id = :id")
    suspend fun updateProgress(id: String, bytesDone: Long, bytesTotal: Long, at: Long)

    @Query("UPDATE download_jobs SET attempts = attempts + 1 WHERE id = :id")
    suspend fun incrementAttempts(id: String)

    @Query("SELECT COUNT(*) FROM download_jobs WHERE scope_key = :scopeKey AND state = 'done'")
    suspend fun countDone(scopeKey: String): Int

    @Query("SELECT COUNT(*) FROM download_jobs WHERE scope_key = :scopeKey")
    suspend fun countTotal(scopeKey: String): Int

    @Query("DELETE FROM download_jobs WHERE collection_key = :collectionKey")
    suspend fun deleteByCollection(collectionKey: String)

    @Query("DELETE FROM download_jobs WHERE scope_key = :scopeKey")
    suspend fun deleteByScope(scopeKey: String)
}

@Dao
interface DownloadScopeDao {
    @Upsert
    suspend fun upsert(scope: DownloadScopeEntity)

    @Query("SELECT * FROM download_scopes WHERE `key` = :key")
    suspend fun getByKey(key: String): DownloadScopeEntity?

    @Query("SELECT * FROM download_scopes WHERE collection_key = :collectionKey")
    suspend fun getByCollection(collectionKey: String): List<DownloadScopeEntity>

    @Query("SELECT * FROM download_scopes WHERE download_state = 'downloading'")
    suspend fun getDownloading(): List<DownloadScopeEntity>

    @Query("UPDATE download_scopes SET download_state = :state, updated_at = :at WHERE `key` = :key")
    suspend fun setState(key: String, state: String, at: Long)

    @Query("DELETE FROM download_scopes WHERE `key` = :key")
    suspend fun delete(key: String)
}

@Dao
interface DownloadFileDao {
    @Upsert
    suspend fun upsert(file: DownloadFileEntity)

    @Upsert
    suspend fun upsertAll(files: List<DownloadFileEntity>)

    @Query("SELECT * FROM download_files WHERE track_id = :trackId")
    suspend fun getByTrack(trackId: String): List<DownloadFileEntity>

    @Query("SELECT * FROM download_files WHERE scope_key = :scopeKey")
    suspend fun getByScope(scopeKey: String): List<DownloadFileEntity>

    @Query("SELECT DISTINCT track_id FROM download_files WHERE scope_key = :scopeKey")
    suspend fun getTrackIdsByScope(scopeKey: String): List<String>

    @Query(
        "SELECT * FROM download_files WHERE track_id = :trackId " +
            "ORDER BY CASE scope_kind WHEN 'collection' THEN 0 ELSE 1 END, created_at ASC LIMIT 1",
    )
    suspend fun getBestForTrack(trackId: String): DownloadFileEntity?

    @Query("DELETE FROM download_files WHERE scope_key = :scopeKey")
    suspend fun deleteByScope(scopeKey: String)
}

/** One scope's queue, counted from its rows (mirrors DownloadProgress in RN). */
data class DownloadProgressRow(
    val total: Int,
    val done: Int,
    val failed: Int,
    val bytesDone: Long,
    val bytesTotal: Long,
)
