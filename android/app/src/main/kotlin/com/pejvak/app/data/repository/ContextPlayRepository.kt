package com.pejvak.app.data.repository

import com.pejvak.app.data.local.ContextPlayDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextStats
import com.pejvak.app.domain.ContextType
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/** Reads runs (playback contexts) and their per-collection stats. */
@Singleton
class ContextPlayRepository @Inject constructor(
    private val contextPlayDao: ContextPlayDao,
    private val syncScheduler: SyncScheduler,
) {
    fun observeLive(): Flow<List<ContextPlay>> =
        contextPlayDao.observeLive().map { rows -> rows.map { it.toDomain() } }

    suspend fun getAll(): List<ContextPlay> = withContext(Dispatchers.IO) {
        contextPlayDao.getAll().map { it.toDomain() }
    }

    suspend fun getByKey(type: ContextType, key: String): List<ContextPlay> =
        withContext(Dispatchers.IO) {
            contextPlayDao.getByKey(type.wire, key).map { it.toDomain() }
        }

    suspend fun statsFor(type: ContextType, key: String): ContextStats =
        withContext(Dispatchers.IO) {
            val row = contextPlayDao.statsFor(type.wire, key)
            ContextStats(
                playCount = row.playCount,
                completedPlayCount = row.completedPlayCount,
                listenedSec = row.listenedSec,
                lastPlayedAt = row.lastPlayedAt,
                bestFinishedCount = row.bestFinishedCount,
            )
        }

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        contextPlayDao.softDelete(id, System.currentTimeMillis())
        syncScheduler.syncNow()
    }
}
