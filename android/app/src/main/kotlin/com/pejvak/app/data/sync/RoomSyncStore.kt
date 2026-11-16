package com.pejvak.app.data.sync

import com.pejvak.app.data.local.AnnotationDao
import com.pejvak.app.data.local.ContextPlayDao
import com.pejvak.app.data.local.OnlineCollectionDao
import com.pejvak.app.data.local.PlaylistDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SharedSettings
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.SyncStore
import com.pejvak.app.domain.Track
import javax.inject.Inject
import javax.inject.Singleton

/** Room-backed [SyncStore]. Local-first; the engine drives the state transitions. */
@Singleton
class RoomSyncStore @Inject constructor(
    private val trackDao: TrackDao,
    private val sessionDao: SessionDao,
    private val annotationDao: AnnotationDao,
    private val playlistDao: PlaylistDao,
    private val contextPlayDao: ContextPlayDao,
    private val onlineCollectionDao: OnlineCollectionDao,
    private val settingsRepository: SettingsRepository,
) : SyncStore {

    override suspend fun getPendingTracks(limit: Int): List<Track> = trackDao.getPendingSync(limit).map { it.toDomain() }
    override suspend fun getAllTracks(): List<Track> = trackDao.getAll().map { it.toDomain() }
    override suspend fun getPendingSessions(limit: Int): List<Session> = sessionDao.getPendingSync(limit).map { it.toDomain() }
    override suspend fun getPendingAnnotations(limit: Int): List<Annotation> = annotationDao.getPendingSync(limit).map { it.toDomain() }
    override suspend fun getPendingPlaylists(limit: Int): List<Playlist> = playlistDao.getPendingSync(limit).map { it.toDomain() }
    override suspend fun getPendingContextPlays(limit: Int): List<ContextPlay> = contextPlayDao.getPendingSync(limit).map { it.toDomain() }
    override suspend fun getPendingOnlineCollections(limit: Int): List<OnlineCollection> = onlineCollectionDao.getPendingSync(limit).map { it.toDomain() }

    override suspend fun setTrackSyncStatus(id: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) trackDao.markSynced(id, serverId)
        else trackDao.setSyncStatus(id, status.wire)
    }
    override suspend fun setSessionSyncStatus(id: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) sessionDao.markSynced(id, serverId)
        else sessionDao.setSyncStatus(id, status.wire)
    }
    override suspend fun setAnnotationSyncStatus(id: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) annotationDao.markSynced(id, serverId)
        else annotationDao.setSyncStatus(id, status.wire)
    }
    override suspend fun setPlaylistSyncStatus(id: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) playlistDao.markSynced(id, serverId)
        else playlistDao.setSyncStatus(id, status.wire)
    }
    override suspend fun setContextPlaySyncStatus(id: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) contextPlayDao.markSynced(id, serverId)
        else contextPlayDao.setSyncStatus(id, status.wire)
    }
    override suspend fun setOnlineCollectionSyncStatus(key: String, status: SyncStatus, serverId: String?) {
        if (status == SyncStatus.Synced && serverId != null) onlineCollectionDao.markSynced(key, serverId)
        else onlineCollectionDao.setSyncStatus(key, status.wire)
    }

    override suspend fun removeAnnotation(id: String) = annotationDao.hardDelete(id)
    override suspend fun removePlaylist(id: String) = playlistDao.hardDelete(id)
    override suspend fun removeOnlineCollection(key: String) = onlineCollectionDao.hardDelete(key)

    override suspend fun getSharedSettings(): SharedSettings? = settingsRepository.getPendingSharedSettings()
    override suspend fun markSettingsSynced(updatedAt: Long) = settingsRepository.markSettingsSynced(updatedAt)
    override suspend fun applyRemoteSettings(settings: SharedSettings, expectedUpdatedAt: Long?): Boolean =
        settingsRepository.applyRemoteSettings(settings, expectedUpdatedAt)
}