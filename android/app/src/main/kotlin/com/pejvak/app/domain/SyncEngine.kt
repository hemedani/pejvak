package com.pejvak.app.domain

/**
 * Push orchestration (mirrors mobile/src/lib/syncEngine.ts). Pure orchestration over
 * a [SyncStore] + [SyncTransport] so the whole push is JVM-testable with fakes.
 *
 * Rows move pending → syncing → synced, or pending → failed and stay queued.
 * syncLocalData is idempotent on clientId, so a retry after a dropped response
 * cannot double-insert.
 */

data class RegisterTrackResult(val serverId: String?)

data class SyncLocalDataResult(
    val syncedSessions: Int = 0,
    val syncedAnnotations: Int = 0,
    val syncedPlaylists: Int = 0,
    val syncedContextPlays: Int = 0,
    val syncedOnlineCollections: Int = 0,
    val annotations: List<IdMapping> = emptyList(),
    val playlists: List<IdMapping> = emptyList(),
    val contextPlays: List<IdMapping> = emptyList(),
    val onlineCollections: List<IdMapping> = emptyList(),
    val settings: SharedSettings? = null,
    /** The server's history meter; returned on every batch (SY-11). */
    val historyQuota: HistoryQuota? = null,
    /** Rows the plan skipped this batch. The device keeps them; the server did not. */
    val historySkipped: Int = 0,
    val crossDeviceSync: Boolean? = null,
)

data class IdMapping(val clientId: String, val serverId: String?)

/** A playlist ready for the wire: item track ids replaced by content hashes. */
data class PlaylistSyncPayload(
    val clientId: String,
    val title: String,
    val description: String?,
    val isPublic: Boolean,
    val items: List<PlaylistHashItem>,
    val updatedAt: Long,
    val deleted: Boolean,
)

data class PlaylistHashItem(val contentHash: String, val order: Int)

/** A finished run through a collection, ready for the wire. Only ended runs are sent. */
data class ContextPlaySyncPayload(
    val clientId: String,
    val contextType: ContextType,
    val contextKey: String,
    val contextTitle: String,
    val trackCount: Int,
    val startedAt: Long,
    val endedAt: Long,
    val lastIndex: Int,
    val lastTrackId: String?,
    val lastPositionSec: Int,
    val listenedSec: Int,
    val finishedCount: Int,
    val completed: Boolean,
    val interrupted: Boolean,
    val updatedAt: Long,
)

/** A saved online collection, ready for the wire. deleted carries the tombstone. */
data class OnlineCollectionSyncPayload(
    val clientId: String,
    val sourceId: String,
    val externalId: String,
    val title: String,
    val languageCode: String,
    val subtitle: String?,
    val artworkUrl: String?,
    val trackCount: Int,
    val pageUrl: String?,
    val isFavorite: Boolean,
    val lastOpenedAt: Long?,
    val updatedAt: Long,
    val deleted: Boolean,
)

interface SyncTransport {
    suspend fun registerTrack(track: Track): RegisterTrackResult
    suspend fun syncLocalData(
        sessions: List<Session>,
        annotations: List<Annotation>,
        playlists: List<PlaylistSyncPayload>,
        contextPlays: List<ContextPlaySyncPayload>,
        onlineCollections: List<OnlineCollectionSyncPayload>,
        settings: SharedSettings?,
    ): SyncLocalDataResult
}

interface SyncStore {
    suspend fun getPendingTracks(limit: Int): List<Track>
    suspend fun getAllTracks(): List<Track>
    suspend fun getPendingSessions(limit: Int): List<Session>
    suspend fun getPendingAnnotations(limit: Int): List<Annotation>
    suspend fun getPendingPlaylists(limit: Int): List<Playlist>
    suspend fun getPendingContextPlays(limit: Int): List<ContextPlay>
    suspend fun getPendingOnlineCollections(limit: Int): List<OnlineCollection>
    suspend fun setTrackSyncStatus(id: String, status: SyncStatus, serverId: String? = null)
    suspend fun setSessionSyncStatus(id: String, status: SyncStatus, serverId: String? = null)
    suspend fun setAnnotationSyncStatus(id: String, status: SyncStatus, serverId: String? = null)
    suspend fun setPlaylistSyncStatus(id: String, status: SyncStatus, serverId: String? = null)
    suspend fun setContextPlaySyncStatus(id: String, status: SyncStatus, serverId: String? = null)
    suspend fun setOnlineCollectionSyncStatus(key: String, status: SyncStatus, serverId: String? = null)
    suspend fun removeAnnotation(id: String)
    suspend fun removePlaylist(id: String)
    suspend fun removeOnlineCollection(key: String)
    suspend fun getSharedSettings(): SharedSettings?
    suspend fun markSettingsSynced(updatedAt: Long)
    suspend fun applyRemoteSettings(settings: SharedSettings, expectedUpdatedAt: Long? = null): Boolean
}

data class SyncSummary(
    val tracksRegistered: Int = 0,
    val sessionsSynced: Int = 0,
    val annotationsSynced: Int = 0,
    val playlistsSynced: Int = 0,
    val contextPlaysSynced: Int = 0,
    val onlineCollectionsSynced: Int = 0,
    val failed: Int = 0,
    val historyQuota: HistoryQuota? = null,
    val historySkipped: Int = 0,
    val crossDeviceSync: Boolean? = null,
)

const val DEFAULT_SYNC_BATCH_SIZE = 50

/**
 * Pushes local state: register pending tracks first (so sessions have a server-side
 * parent), then batch finalized pending sessions + annotations + playlists + runs +
 * collections + settings to syncLocalData.
 */
suspend fun runSync(store: SyncStore, transport: SyncTransport, batchSize: Int = DEFAULT_SYNC_BATCH_SIZE): SyncSummary {
    var summary = SyncSummary()
    val limit = batchSize

    // Read the snapshot before the rows so a settings-only change is not lost.
    val sharedSettings = store.getSharedSettings()

    for (track in store.getPendingTracks(limit)) {
        store.setTrackSyncStatus(track.id, SyncStatus.Syncing)
        try {
            val created = transport.registerTrack(track)
            store.setTrackSyncStatus(track.id, SyncStatus.Synced, created.serverId)
            summary = summary.copy(tracksRegistered = summary.tracksRegistered + 1)
        } catch (_: Exception) {
            store.setTrackSyncStatus(track.id, SyncStatus.Failed)
            summary = summary.copy(failed = summary.failed + 1)
        }
    }

    // Only send rows whose track now exists server-side.
    val allTracks = store.getAllTracks()
    val syncedHashes = allTracks
        .filter { it.syncStatus == SyncStatus.Synced || it.serverId != null }
        .map { it.contentHash }
        .toSet()
    val trackByLocalId = allTracks.associateBy { it.id }

    val sessions = store.getPendingSessions(limit).filter { it.endedAt != null && it.contentHash in syncedHashes }
    val annotations = store.getPendingAnnotations(limit).filter { it.contentHash in syncedHashes }

    // Playlists go last; defer any whose referenced tracks are not registered yet.
    val playlistPayloads = mutableListOf<PlaylistSyncPayload>()
    for (playlist in store.getPendingPlaylists(limit)) {
        if (playlist.deletedAt != null) {
            playlistPayloads.add(
                PlaylistSyncPayload(playlist.id, playlist.title, playlist.description, playlist.isPublic, emptyList(), playlist.deletedAt, deleted = true),
            )
            continue
        }
        val items = mutableListOf<PlaylistHashItem>()
        var resolvedAll = true
        for (item in playlist.items) {
            val track = trackByLocalId[item.trackId]
            if (track == null || track.contentHash !in syncedHashes) { resolvedAll = false; break }
            items.add(PlaylistHashItem(track.contentHash, item.order))
        }
        if (!resolvedAll) continue
        playlistPayloads.add(
            PlaylistSyncPayload(playlist.id, playlist.title, playlist.description, playlist.isPublic, items, playlist.updatedAt, deleted = false),
        )
    }

    // Runs identify their collection by key, so nothing needs resolving first.
    val contextPlayPayloads = mutableListOf<ContextPlaySyncPayload>()
    for (run in store.getPendingContextPlays(limit)) {
        val endedAt = run.endedAt ?: continue
        contextPlayPayloads.add(
            ContextPlaySyncPayload(
                run.id, run.contextType, run.contextKey, run.contextTitle, run.trackCount,
                run.startedAt, endedAt, run.lastIndex, run.lastTrackId, run.lastPositionSec,
                run.listenedSec, run.finishedCount, run.completed, run.interrupted, run.updatedAt,
            ),
        )
    }

    // Tombstoned collections are sent as deletions, not filtered out.
    val onlineCollectionPayloads = mutableListOf<OnlineCollectionSyncPayload>()
    for (saved in store.getPendingOnlineCollections(limit)) {
        onlineCollectionPayloads.add(
            OnlineCollectionSyncPayload(
                saved.key, saved.sourceId, saved.externalId, saved.title, saved.languageCode,
                saved.subtitle, saved.artworkUrl, saved.trackCount, saved.pageUrl, saved.isFavorite,
                saved.lastOpenedAt, saved.updatedAt, deleted = saved.deletedAt != null,
            ),
        )
    }

    if (sessions.isEmpty() && annotations.isEmpty() && playlistPayloads.isEmpty() &&
        contextPlayPayloads.isEmpty() && onlineCollectionPayloads.isEmpty() && sharedSettings == null
    ) {
        return summary
    }

    sessions.forEach { store.setSessionSyncStatus(it.id, SyncStatus.Syncing) }
    annotations.forEach { store.setAnnotationSyncStatus(it.id, SyncStatus.Syncing) }
    playlistPayloads.forEach { store.setPlaylistSyncStatus(it.clientId, SyncStatus.Syncing) }
    contextPlayPayloads.forEach { store.setContextPlaySyncStatus(it.clientId, SyncStatus.Syncing) }
    onlineCollectionPayloads.forEach { store.setOnlineCollectionSyncStatus(it.clientId, SyncStatus.Syncing) }

    try {
        val result = transport.syncLocalData(sessions, annotations, playlistPayloads, contextPlayPayloads, onlineCollectionPayloads, sharedSettings)
        if (result.settings != null) {
            // A settings write failing must not turn an acknowledged batch into a failed one.
            runCatching { store.applyRemoteSettings(result.settings, sharedSettings?.updatedAt) }
        }
        if (sharedSettings != null) {
            runCatching { store.markSettingsSynced(sharedSettings.updatedAt) }
        }
        val annotationServerIds = result.annotations.associate { it.clientId to it.serverId }
        val playlistServerIds = result.playlists.associate { it.clientId to it.serverId }
        val contextPlayServerIds = result.contextPlays.associate { it.clientId to it.serverId }
        val onlineCollectionServerIds = result.onlineCollections.associate { it.clientId to it.serverId }

        sessions.forEach { store.setSessionSyncStatus(it.id, SyncStatus.Synced) }
        annotations.forEach { annotation ->
            if (annotation.deletedAt != null) store.removeAnnotation(annotation.id)
            else store.setAnnotationSyncStatus(annotation.id, SyncStatus.Synced, annotationServerIds[annotation.id])
        }
        playlistPayloads.forEach { playlist ->
            if (playlist.deleted) store.removePlaylist(playlist.clientId)
            else store.setPlaylistSyncStatus(playlist.clientId, SyncStatus.Synced, playlistServerIds[playlist.clientId])
        }
        contextPlayPayloads.forEach { store.setContextPlaySyncStatus(it.clientId, SyncStatus.Synced, contextPlayServerIds[it.clientId]) }
        onlineCollectionPayloads.forEach { saved ->
            if (saved.deleted) store.removeOnlineCollection(saved.clientId)
            else store.setOnlineCollectionSyncStatus(saved.clientId, SyncStatus.Synced, onlineCollectionServerIds[saved.clientId])
        }
        summary = summary.copy(
            sessionsSynced = result.syncedSessions,
            annotationsSynced = result.syncedAnnotations,
            playlistsSynced = result.syncedPlaylists,
            contextPlaysSynced = result.syncedContextPlays,
            onlineCollectionsSynced = result.syncedOnlineCollections,
            historyQuota = result.historyQuota,
            historySkipped = result.historySkipped,
            crossDeviceSync = result.crossDeviceSync,
        )
    } catch (_: Exception) {
        sessions.forEach { store.setSessionSyncStatus(it.id, SyncStatus.Failed) }
        annotations.forEach { store.setAnnotationSyncStatus(it.id, SyncStatus.Failed) }
        playlistPayloads.forEach { store.setPlaylistSyncStatus(it.clientId, SyncStatus.Failed) }
        contextPlayPayloads.forEach { store.setContextPlaySyncStatus(it.clientId, SyncStatus.Failed) }
        onlineCollectionPayloads.forEach { store.setOnlineCollectionSyncStatus(it.clientId, SyncStatus.Failed) }
        summary = summary.copy(
            failed = summary.failed + sessions.size + annotations.size + playlistPayloads.size +
                contextPlayPayloads.size + onlineCollectionPayloads.size + (if (sharedSettings == null) 0 else 1),
        )
    }

    return summary
}