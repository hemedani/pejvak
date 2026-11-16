package com.pejvak.app.data.repository

import com.pejvak.app.data.local.OnlineCollectionDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.online.OnlineCollectionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The saved online shelf (mirrors OnlineCatalogService's collection writes).
 * A row is created on first open; favourite/open/download setters all dirty sync.
 * A tombstone is never resurrected by a remote insert.
 */
@Singleton
class OnlineCollectionRepository @Inject constructor(
    private val dao: OnlineCollectionDao,
) {
    fun observeFavorites(): Flow<List<OnlineCollection>> =
        dao.observeFavorites().map { rows -> rows.map { it.toDomain() } }

    fun observeLive(): Flow<List<OnlineCollection>> =
        dao.observeLive().map { rows -> rows.map { it.toDomain() } }

    suspend fun get(key: String): OnlineCollection? = withContext(Dispatchers.IO) { dao.getByKey(key)?.toDomain() }

    suspend fun getBySource(sourceId: String): List<OnlineCollection> = withContext(Dispatchers.IO) {
        dao.getLive().filter { it.source_id == sourceId }.map { it.toDomain() }
    }

    suspend fun save(info: OnlineCollectionInfo, languageCode: String, now: Long = System.currentTimeMillis()): OnlineCollection =
        withContext(Dispatchers.IO) {
            val existing = dao.getByKey(info.key)?.toDomain()
            val row = if (existing != null) {
                existing.copy(
                    title = info.title,
                    subtitle = info.subtitle ?: existing.subtitle,
                    artworkUrl = info.artworkUrl ?: existing.artworkUrl,
                    trackCount = if (info.trackCount > 0) info.trackCount else existing.trackCount,
                    pageUrl = info.pageUrl ?: existing.pageUrl,
                    languageCode = languageCode,
                    updatedAt = now,
                )
            } else {
                OnlineCollection(
                    key = info.key,
                    sourceId = info.sourceId,
                    externalId = info.externalId,
                    title = info.title,
                    subtitle = info.subtitle,
                    artworkUrl = info.artworkUrl,
                    languageCode = languageCode,
                    trackCount = info.trackCount,
                    pageUrl = info.pageUrl,
                    createdAt = now,
                    updatedAt = now,
                )
            }
            dao.upsert(row.toEntity())
            row
        }

    suspend fun setFavorite(key: String, favorite: Boolean, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { dao.setFavorite(key, favorite, now) }

    suspend fun markOpened(key: String, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { dao.markOpened(key, now) }

    suspend fun setDownloadState(key: String, state: com.pejvak.app.domain.DownloadState, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { dao.setDownloadState(key, state.wire, now) }

    suspend fun softDelete(key: String, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { dao.softDelete(key, now) }
}
