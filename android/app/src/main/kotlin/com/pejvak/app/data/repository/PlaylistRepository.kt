package com.pejvak.app.data.repository

import com.pejvak.app.data.local.PlaylistDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.PlaybackContext
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.addTracksToPlaylist
import com.pejvak.app.domain.movePlaylistItem
import com.pejvak.app.domain.removeTracksFromPlaylist
import com.pejvak.app.domain.resolvePlaylistTracks
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * The single owner of playlists. Every edit writes SQLite first and queues a
 * sync; the title is required and trimmed. Ordering lives in `domain/Playlists`.
 */
@Singleton
class PlaylistRepository @Inject constructor(
    private val playlistDao: PlaylistDao,
    private val trackDao: TrackDao,
    private val syncScheduler: SyncScheduler,
) {
    fun observeLive(): Flow<List<Playlist>> =
        playlistDao.observeLive().map { rows -> rows.map { it.toDomain() } }

    suspend fun getAll(): List<Playlist> = withContext(Dispatchers.IO) {
        playlistDao.getLive().map { it.toDomain() }
    }

    suspend fun get(id: String): Playlist? = withContext(Dispatchers.IO) {
        playlistDao.getById(id)?.toDomain()
    }

    suspend fun create(title: String): Playlist = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val playlist = Playlist(
            id = UUID.randomUUID().toString(),
            title = requireTitle(title),
            syncStatus = SyncStatus.Pending,
            createdAt = now,
            updatedAt = now,
        )
        playlistDao.upsert(playlist.toEntity())
        syncScheduler.syncNow()
        playlist
    }

    suspend fun createWithTracks(title: String, trackIds: List<String>): Playlist =
        withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val playlist = Playlist(
                id = UUID.randomUUID().toString(),
                title = requireTitle(title),
                items = addTracksToPlaylist(emptyList(), trackIds),
                syncStatus = SyncStatus.Pending,
                createdAt = now,
                updatedAt = now,
            )
            playlistDao.upsert(playlist.toEntity())
            syncScheduler.syncNow()
            playlist
        }

    suspend fun rename(id: String, title: String): Playlist? = mutate(id) { playlist ->
        playlist.copy(title = requireTitle(title))
    }

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        playlistDao.softDelete(id, System.currentTimeMillis())
        syncScheduler.syncNow()
    }

    suspend fun addTracks(id: String, trackIds: List<String>): Playlist? = mutate(id) { playlist ->
        playlist.copy(items = addTracksToPlaylist(playlist.items, trackIds))
    }

    suspend fun removeTracks(id: String, trackIds: List<String>): Playlist? = mutate(id) { playlist ->
        playlist.copy(items = removeTracksFromPlaylist(playlist.items, trackIds))
    }

    suspend fun moveTrack(id: String, from: Int, to: Int): Playlist? = mutate(id) { playlist ->
        playlist.copy(items = movePlaylistItem(playlist.items, from, to))
    }

    suspend fun tracks(playlist: Playlist): List<Track> = withContext(Dispatchers.IO) {
        val ids = playlist.items.map { it.trackId }
        if (ids.isEmpty()) return@withContext emptyList()
        resolvePlaylistTracks(playlist.items, trackDao.getByIds(ids).map { it.toDomain() })
    }

    fun contextFor(playlist: Playlist): PlaybackContext =
        PlaybackContext(
            com.pejvak.app.domain.ContextType.Playlist,
            playlist.id,
            playlist.title,
            CollectionSort.Manual,
        )

    private suspend fun mutate(
        id: String,
        change: (Playlist) -> Playlist,
    ): Playlist? = withContext(Dispatchers.IO) {
        val existing = playlistDao.getById(id)?.toDomain() ?: return@withContext null
        val updated = change(existing).copy(
            updatedAt = maxOf(System.currentTimeMillis(), existing.updatedAt + 1),
            syncStatus = SyncStatus.Pending,
        )
        playlistDao.upsert(updated.toEntity())
        syncScheduler.syncNow()
        updated
    }

    private fun requireTitle(title: String): String {
        val trimmed = title.trim()
        require(trimmed.isNotEmpty()) { "Playlist title is required" }
        return trimmed
    }
}
