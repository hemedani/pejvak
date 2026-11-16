package com.pejvak.app.data.repository

import com.pejvak.app.data.local.AnnotationDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.normalizeTags
import com.pejvak.app.domain.pickAnnotationColor
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * The single owner of notes (mirrors mobile/src/services/AnnotationService.ts).
 * Creation writes SQLite first and queues a sync; updates are last-write-wins on
 * `updatedAt`; deletion tombstones the row so a queued delete can still reach the
 * server if the original create's response was lost. Sync never blocks the caller.
 */
@Singleton
class AnnotationRepository @Inject constructor(
    private val annotationDao: AnnotationDao,
    private val sessionDao: SessionDao,
    private val syncScheduler: SyncScheduler,
) {
    fun observeForTrack(trackId: String): Flow<List<Annotation>> =
        annotationDao.observeForTrack(trackId).map { rows -> rows.map { it.toDomain() } }

    /** Every live note, newest-edited first, for the Notes screen. */
    fun observeLive(): Flow<List<Annotation>> =
        annotationDao.observeLive().map { rows -> rows.map { it.toDomain() } }

    suspend fun getForTrack(trackId: String): List<Annotation> = withContext(Dispatchers.IO) {
        annotationDao.getForTrack(trackId).map { it.toDomain() }
    }

    suspend fun getAll(): List<Annotation> = withContext(Dispatchers.IO) {
        annotationDao.getLive().map { it.toDomain() }
    }

    /**
     * Creates a note at [positionSec]. The colour defaults to the palette pick for
     * this track's note count, and `timesPlayedBefore` counts finalized sessions —
     * both read before the write so the row records the moment it was written.
     */
    suspend fun create(
        trackId: String,
        contentHash: String,
        positionSec: Int,
        text: String,
        tags: List<String> = emptyList(),
        color: String? = null,
    ): Annotation = withContext(Dispatchers.IO) {
        val trimmed = text.trim()
        require(trimmed.isNotEmpty()) { "Annotation text is required" }
        val now = System.currentTimeMillis()
        val annotation = Annotation(
            id = UUID.randomUUID().toString(),
            trackId = trackId,
            contentHash = contentHash,
            positionSec = positionSec.coerceAtLeast(0),
            text = trimmed,
            tags = normalizeTags(tags),
            color = color ?: pickAnnotationColor(annotationDao.countForTrack(trackId)),
            timesPlayedBefore = timesPlayedBefore(trackId),
            syncStatus = SyncStatus.Pending,
            createdAt = now,
            updatedAt = now,
        )
        annotationDao.upsert(annotation.toEntity())
        syncScheduler.syncNow()
        annotation
    }

    /** Edits a note; `updatedAt` is strictly newer so LWW cannot tie with the row it replaces. */
    suspend fun update(
        id: String,
        text: String,
        tags: List<String>,
        color: String?,
    ): Annotation? = withContext(Dispatchers.IO) {
        val existing = annotationDao.getById(id)?.toDomain() ?: return@withContext null
        val trimmed = text.trim()
        require(trimmed.isNotEmpty()) { "Annotation text is required" }
        val updated = existing.copy(
            text = trimmed,
            tags = normalizeTags(tags),
            color = color,
            updatedAt = maxOf(System.currentTimeMillis(), existing.updatedAt + 1),
            syncStatus = SyncStatus.Pending,
        )
        annotationDao.upsert(updated.toEntity())
        syncScheduler.syncNow()
        updated
    }

    /** Tombstones the note; the sync engine hard-deletes it after acknowledgement. */
    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        annotationDao.softDelete(id, System.currentTimeMillis())
        syncScheduler.syncNow()
    }

    suspend fun timesPlayedBefore(trackId: String): Int = withContext(Dispatchers.IO) {
        sessionDao.getForTrack(trackId).count { it.ended_at != null }
    }
}
