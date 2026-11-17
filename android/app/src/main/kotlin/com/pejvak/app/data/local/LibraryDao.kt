package com.pejvak.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TrackDao {
    @Upsert
    suspend fun upsert(track: TrackEntity)

    @Upsert
    suspend fun upsertAll(tracks: List<TrackEntity>)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(track: TrackEntity): Long

    @Query("SELECT * FROM tracks WHERE id = :id")
    suspend fun getById(id: String): TrackEntity?

    @Query("SELECT * FROM tracks WHERE id IN (:ids)")
    suspend fun getByIds(ids: List<String>): List<TrackEntity>

    @Query("SELECT * FROM tracks WHERE content_hash = :hash")
    suspend fun getByContentHash(hash: String): TrackEntity?

    @Query("SELECT * FROM tracks WHERE source_uri = :uri LIMIT 1")
    suspend fun getBySourceUri(uri: String): TrackEntity?

    @Query("SELECT * FROM tracks WHERE folder_key = :folderKey ORDER BY title")
    suspend fun getByFolderKey(folderKey: String): List<TrackEntity>

    @Query("SELECT * FROM tracks WHERE collection_key = :collectionKey ORDER BY track_number, title")
    suspend fun getByCollectionKey(collectionKey: String): List<TrackEntity>

    @Query("SELECT * FROM tracks WHERE availability = :availability ORDER BY updated_at DESC")
    suspend fun getByAvailability(availability: String): List<TrackEntity>

    @Query("SELECT * FROM tracks ORDER BY title")
    fun observeAll(): Flow<List<TrackEntity>>

    @Query("SELECT * FROM tracks")
    suspend fun getAll(): List<TrackEntity>

    @Query("SELECT COUNT(*) FROM tracks")
    suspend fun count(): Int

    @Query("SELECT * FROM tracks WHERE sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<TrackEntity>

    @Query("SELECT * FROM tracks WHERE sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<TrackEntity>

    @Query("UPDATE tracks SET origin = :origin WHERE id = :id")
    suspend fun setOrigin(id: String, origin: String)

    @Query(
        """UPDATE tracks SET source_id = :sourceId, external_id = :externalId,
           collection_key = :collectionKey, collection_title = :collectionTitle,
           artwork_url = COALESCE(:artworkUrl, artwork_url), origin = 'online'
           WHERE id = :id""",
    )
    suspend fun setOnlineIdentity(
        id: String,
        sourceId: String,
        externalId: String,
        collectionKey: String?,
        collectionTitle: String?,
        artworkUrl: String?,
    )

    @Query("UPDATE tracks SET sync_status = 'synced', server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)

    @Query("UPDATE tracks SET sync_status = :status WHERE id = :id")
    suspend fun setSyncStatus(id: String, status: String)

    @Query("UPDATE tracks SET availability = :availability WHERE id = :id")
    suspend fun setAvailability(id: String, availability: String)

    @Query(
        "UPDATE tracks SET file_uri = :fileUri, download_path = :downloadPath, downloaded_at = :at, " +
            "file_size_bytes = :sizeBytes, duration_sec = CASE WHEN duration_sec = 0 THEN :durationSec ELSE duration_sec END, " +
            "folder_key = :folderKey, folder_name = :folderName, track_number = :trackNumber, " +
            "availability = 'present', updated_at = :at WHERE id = :id",
    )
    suspend fun markDownloaded(
        id: String, fileUri: String, downloadPath: String, at: Long, sizeBytes: Long,
        durationSec: Int, folderKey: String, folderName: String, trackNumber: Int,
    )

    @Query(
        "UPDATE tracks SET file_uri = COALESCE(stream_url, file_uri), download_path = NULL, " +
            "downloaded_at = NULL, file_size_bytes = 0, folder_key = NULL, folder_name = NULL, " +
            "availability = CASE WHEN stream_url IS NULL THEN 'missing' ELSE 'present' END, " +
            "updated_at = :at WHERE id = :id AND origin = 'online'",
    )
    suspend fun revertToStream(id: String, at: Long)

    @Query("UPDATE tracks SET duration_sec = :durationSec WHERE id = :id")
    suspend fun setDuration(id: String, durationSec: Int)

    // Artwork backfill excludes streams in SQL (a byte read of a stream can only throw).
    @Query("SELECT * FROM tracks WHERE artwork_url IS NULL AND artwork_checked_at IS NULL AND file_uri NOT LIKE 'http%' LIMIT :limit")
    suspend fun getTracksMissingArtwork(limit: Int): List<TrackEntity>

    @Query("UPDATE tracks SET artwork_checked_at = :at WHERE id = :id")
    suspend fun markArtworkChecked(id: String, at: Long)

    @Query("UPDATE tracks SET artwork_url = :url, artwork_checked_at = :at, updated_at = :at WHERE id = :id")
    suspend fun setArtwork(id: String, url: String, at: Long)

    @Query("SELECT COUNT(*) FROM tracks WHERE artwork_url IS NULL AND artwork_checked_at IS NULL AND file_uri NOT LIKE 'http%'")
    suspend fun countMissingArtwork(): Int

    @Query(
        "UPDATE tracks SET source_uri = :sourceUri, source_path = :sourcePath, source_size = :sourceSize, " +
            "source_mtime = :sourceMtime, file_uri = :sourceUri, folder_key = :folderKey, folder_name = :folderName, " +
            "availability = 'present', updated_at = :at WHERE id = :id",
    )
    suspend fun updateLocation(
        id: String,
        sourceUri: String,
        sourcePath: String?,
        sourceSize: Long?,
        sourceMtime: Long?,
        folderKey: String?,
        folderName: String?,
        at: Long,
    )

    @Query("DELETE FROM tracks WHERE id = :id")
    suspend fun delete(id: String)
}

/** Per-track listening stake, for the missing-files screen. */
data class TrackActivityCount(
    val track_id: String,
    val sessionCount: Int,
    val listenedSec: Int,
)

/** Per-track annotation count, for library cards and the missing-files screen. */
data class TrackAnnotationCount(
    val track_id: String,
    val noteCount: Int,
)

@Dao
interface FolderDao {
    @Upsert
    suspend fun upsert(folder: FolderEntity)

    @Query("SELECT * FROM folders WHERE `key` = :key")
    suspend fun getByKey(key: String): FolderEntity?

    @Query("SELECT * FROM folders")
    fun observeAll(): Flow<List<FolderEntity>>

    @Query("UPDATE folders SET last_played_at = :at WHERE `key` = :key")
    suspend fun touchPlayed(key: String, at: Long)

    @Query("DELETE FROM folders WHERE `key` = :key")
    suspend fun delete(key: String)
}