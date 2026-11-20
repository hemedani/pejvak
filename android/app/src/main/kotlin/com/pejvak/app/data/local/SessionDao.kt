package com.pejvak.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {
    @Upsert
    suspend fun upsert(session: SessionEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(session: SessionEntity): Long

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun getById(id: String): SessionEntity?

    @Query("SELECT * FROM sessions WHERE track_id = :trackId AND deleted_at IS NULL ORDER BY started_at DESC")
    suspend fun getForTrack(trackId: String): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE context_play_id = :runId AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1")
    suspend fun latestForRun(runId: String): SessionEntity?

    @Query(
        "SELECT track_id, COUNT(*) AS sessionCount, COALESCE(SUM(duration_listened_sec), 0) AS listenedSec " +
            "FROM sessions WHERE deleted_at IS NULL AND track_id IN (:trackIds) GROUP BY track_id",
    )
    suspend fun activityCounts(trackIds: List<String>): List<TrackActivityCount>

    @Query("SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY started_at DESC")
    fun observeLive(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY started_at DESC")
    suspend fun getLive(): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE ended_at IS NULL AND deleted_at IS NULL")
    suspend fun getOpen(): List<SessionEntity>

    /**
     * Keyset pagination by *stretch*: the subquery picks the next N stretch ids
     * older than the cursor, then every member of those stretches is returned,
     * so a multi-track listen is never cut in half.
     */
    @Query(
        "SELECT * FROM sessions WHERE deleted_at IS NULL AND stretch_id IN (" +
            "SELECT stretch_id FROM sessions WHERE deleted_at IS NULL " +
            "AND (started_at < :cursorStartedAt OR (started_at = :cursorStartedAt AND stretch_id < :cursorStretchId)) " +
            "GROUP BY stretch_id ORDER BY MAX(started_at) DESC, stretch_id DESC LIMIT :limit" +
            ") ORDER BY started_at DESC",
    )
    suspend fun pageByStretch(
        cursorStartedAt: Long,
        cursorStretchId: String,
        limit: Int,
    ): List<SessionEntity>

    @Query(
        "SELECT * FROM sessions WHERE deleted_at IS NULL " +
            "AND (:from IS NULL OR started_at >= :from) AND (:to IS NULL OR started_at <= :to) " +
            "ORDER BY started_at DESC LIMIT :limit",
    )
    suspend fun getRange(from: Long?, to: Long?, limit: Int): List<SessionEntity>

    @Query("UPDATE sessions SET deleted_at = :at, sync_status = 'pending' WHERE id IN (:ids)")
    suspend fun softDeleteMany(ids: List<String>, at: Long)

    @Query("SELECT * FROM sessions WHERE id IN (:ids)")
    suspend fun getByIds(ids: List<String>): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE ended_at IS NOT NULL AND sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE ended_at IS NOT NULL AND sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<SessionEntity>

    @Query("SELECT * FROM sessions")
    suspend fun getAll(): List<SessionEntity>

    @Query("UPDATE sessions SET sync_status = 'synced', server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)

    @Query("UPDATE sessions SET sync_status = :status WHERE id = :id")
    suspend fun setSyncStatus(id: String, status: String)

    @Query("UPDATE sessions SET ended_at = :endedAt, end_position_sec = :endPositionSec, duration_listened_sec = :listenedSec, completed = :completed, interrupted = :interrupted, updated_at = :endedAt WHERE id = :id")
    suspend fun finalize(id: String, endedAt: Long, endPositionSec: Int, listenedSec: Int, completed: Boolean, interrupted: Boolean)

    @Query("UPDATE sessions SET seeked = 1 WHERE id = :id")
    suspend fun markSeeked(id: String)

    @Query(
        "UPDATE sessions SET ambient_tone = :tone, ambient_level = :level, volume_percent = :volume, " +
            "enhancer_enabled = :enhancerEnabled, enhancer_boost_db = :boostDb, enhancer_bass_db = :bassDb, " +
            "enhancer_treble_db = :trebleDb, updated_at = :at, sync_status = 'pending' WHERE id = :id",
    )
    suspend fun updateAudioConditions(
        id: String,
        tone: String,
        level: Int,
        volume: Int,
        enhancerEnabled: Boolean,
        boostDb: Double,
        bassDb: Double,
        trebleDb: Double,
        at: Long,
    )

    @Query(
        "UPDATE sessions SET collection_sort = :sort, collection_sort_direction = :direction, " +
            "collection_index = :index, collection_size = :size, updated_at = :at, sync_status = 'pending' WHERE id = :id",
    )
    suspend fun updateCollectionOrder(
        id: String,
        sort: String,
        direction: String,
        index: Int,
        size: Int,
        at: Long,
    )

    @Query("UPDATE sessions SET deleted_at = :at, sync_status = 'pending' WHERE id = :id")
    suspend fun softDelete(id: String, at: Long)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun hardDelete(id: String)
}

data class ContextStatsRow(
    val playCount: Int,
    val completedPlayCount: Int,
    val listenedSec: Int,
    val lastPlayedAt: Long?,
    val bestFinishedCount: Int,
)

@Dao
interface CheckpointDao {
    @Upsert
    suspend fun upsert(checkpoint: CheckpointEntity)

    @Query("SELECT * FROM playback_checkpoints WHERE session_id = :sessionId")
    suspend fun getBySession(sessionId: String): CheckpointEntity?

    // Orphan = a checkpoint whose session never ended (or has no row). Recovery
    // finalizes these on launch so a kill never loses a session.
    @Query("SELECT c.* FROM playback_checkpoints c LEFT JOIN sessions s ON c.session_id = s.id WHERE s.ended_at IS NULL")
    suspend fun getOrphaned(): List<CheckpointEntity>

    @Query("DELETE FROM playback_checkpoints WHERE session_id = :sessionId")
    suspend fun deleteBySession(sessionId: String)

    @Query("DELETE FROM playback_checkpoints WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface ContextPlayDao {
    @Upsert
    suspend fun upsert(run: ContextPlayEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(run: ContextPlayEntity): Long

    @Query("SELECT * FROM context_plays WHERE id = :id")
    suspend fun getById(id: String): ContextPlayEntity?

    @Query("SELECT * FROM context_plays WHERE ended_at IS NULL AND deleted_at IS NULL")
    suspend fun getOpen(): List<ContextPlayEntity>

    @Query("SELECT * FROM context_plays WHERE context_type = :type AND context_key = :key AND deleted_at IS NULL ORDER BY started_at DESC")
    suspend fun getByKey(type: String, key: String): List<ContextPlayEntity>

    @Query(
        "SELECT COUNT(*) AS playCount, " +
            "COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completedPlayCount, " +
            "COALESCE(SUM(listened_sec), 0) AS listenedSec, MAX(started_at) AS lastPlayedAt, " +
            "COALESCE(MAX(finished_count), 0) AS bestFinishedCount " +
            "FROM context_plays WHERE context_type = :type AND context_key = :key AND deleted_at IS NULL",
    )
    suspend fun statsFor(type: String, key: String): ContextStatsRow

    @Query("SELECT * FROM context_plays WHERE deleted_at IS NULL ORDER BY started_at DESC")
    fun observeLive(): Flow<List<ContextPlayEntity>>

    @Query("SELECT * FROM context_plays WHERE sync_status IN ('pending','failed')")
    suspend fun getPendingSync(): List<ContextPlayEntity>

    @Query("SELECT * FROM context_plays WHERE sync_status IN ('pending','failed') LIMIT :limit")
    suspend fun getPendingSync(limit: Int): List<ContextPlayEntity>

    @Query("SELECT * FROM context_plays")
    suspend fun getAll(): List<ContextPlayEntity>

    @Query("UPDATE context_plays SET sync_status = 'synced', server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)

    @Query("UPDATE context_plays SET sync_status = :status WHERE id = :id")
    suspend fun setSyncStatus(id: String, status: String)

    @Query("UPDATE context_plays SET ended_at = :endedAt, completed = :completed, interrupted = :interrupted, updated_at = :endedAt WHERE id = :id")
    suspend fun finalize(id: String, endedAt: Long, completed: Boolean, interrupted: Boolean)

    @Query("UPDATE context_plays SET last_index = :lastIndex, last_track_id = :lastTrackId, last_position_sec = :lastPositionSec, listened_sec = :listenedSec, finished_count = :finishedCount, updated_at = :at WHERE id = :id")
    suspend fun touch(id: String, lastIndex: Int, lastTrackId: String?, lastPositionSec: Int, listenedSec: Int, finishedCount: Int, at: Long)

    @Query("UPDATE context_plays SET deleted_at = :at, sync_status = 'pending' WHERE id = :id")
    suspend fun softDelete(id: String, at: Long)

    @Query("DELETE FROM context_plays WHERE id = :id")
    suspend fun hardDelete(id: String)
}