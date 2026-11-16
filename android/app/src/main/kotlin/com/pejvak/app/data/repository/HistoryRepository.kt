package com.pejvak.app.data.repository

import com.pejvak.app.data.local.PlaylistDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.DateRange
import com.pejvak.app.domain.HistoryCursor
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.folderNameFromKey
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Reads the history the player wrote. Sessions are append-only and deleted by
 * tombstone, so every query here filters `deleted_at IS NULL`. Joins tracks and
 * collection titles once, at the boundary, rather than in each card.
 */
@Singleton
class HistoryRepository @Inject constructor(
    private val sessionDao: SessionDao,
    private val trackDao: TrackDao,
    private val playlistDao: PlaylistDao,
    private val syncScheduler: SyncScheduler,
) {
    suspend fun page(cursor: HistoryCursor?, limit: Int = 40): List<HistoryItem> =
        withContext(Dispatchers.IO) {
            val rows = sessionDao.pageByStretch(
                cursorStartedAt = cursor?.startedAt ?: Long.MAX_VALUE,
                cursorStretchId = cursor?.stretchId ?: "\uFFFF",
                limit = limit,
            )
            join(rows.map { it.toDomain() })
        }

    suspend fun all(range: DateRange = DateRange(null, null), limit: Int = 1000): List<HistoryItem> =
        withContext(Dispatchers.IO) {
            join(sessionDao.getRange(range.from, range.to, limit).map { it.toDomain() })
        }

    suspend fun byIds(ids: List<String>): List<HistoryItem> = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) emptyList() else join(sessionDao.getByIds(ids).map { it.toDomain() })
    }

    suspend fun deleteSessions(ids: List<String>) = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        sessionDao.softDeleteMany(ids, System.currentTimeMillis())
        syncScheduler.syncNow()
    }

    suspend fun deleteStretch(stretchId: String) {
        val items = all().filter { it.session.stretchId == stretchId }
        deleteSessions(items.map { it.session.id })
    }

    private suspend fun join(sessions: List<Session>): List<HistoryItem> {
        if (sessions.isEmpty()) return emptyList()
        val tracks = trackDao.getByIds(sessions.map { it.trackId }.distinct()).associateBy { it.id }
        val playlists = playlistDao.getLive().associateBy { it.id }
        return sessions.mapNotNull { session ->
            val track = tracks[session.trackId]?.toDomain() ?: return@mapNotNull null
            val title = when (session.contextType) {
                com.pejvak.app.domain.ContextType.Folder ->
                    session.contextKey?.let { folderNameFromKey(it) }
                com.pejvak.app.domain.ContextType.Playlist ->
                    session.contextKey?.let { playlists[it]?.title }
                else -> null
            }
            HistoryItem(session, track, title)
        }.sortedByDescending { it.session.startedAt }
    }
}
