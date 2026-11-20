package com.pejvak.app.data.sync

import com.pejvak.app.data.local.AnnotationDao
import com.pejvak.app.data.local.ContextPlayDao
import com.pejvak.app.data.local.OnlineCollectionDao
import com.pejvak.app.data.local.PlaylistDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.HistoryQuota
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.PlaylistItem
import com.pejvak.app.domain.RemotePlaylist
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.SyncSummary
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.reconcileAnnotations
import com.pejvak.app.domain.reconcileContextPlays
import com.pejvak.app.domain.reconcileOnlineCollections
import com.pejvak.app.domain.reconcilePlaylists
import com.pejvak.app.domain.reconcileSessions
import com.pejvak.app.domain.reconcileTracks
import com.pejvak.app.domain.runSync
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Push + pull orchestration (mirrors SyncService.ts). Push never throws for sync
 * errors; pull is best-effort and restores history/annotations on a new device.
 * Tracks match by contentHash, sessions/annotations by clientId; tombstones are
 * never resurrected.
 */
@Singleton
class SyncRepository @Inject constructor(
    private val store: RoomSyncStore,
    private val transport: LesanSyncTransport,
    private val trackDao: TrackDao,
    private val sessionDao: SessionDao,
    private val annotationDao: AnnotationDao,
    private val playlistDao: PlaylistDao,
    private val contextPlayDao: ContextPlayDao,
    private val onlineCollectionDao: OnlineCollectionDao,
    private val settingsRepository: SettingsRepository,
    private val json: Json,
) {
    data class PullSummary(
        val tracks: Int = 0, val sessions: Int = 0, val annotations: Int = 0,
        val playlists: Int = 0, val contextPlays: Int = 0, val onlineCollections: Int = 0,
    )

    data class PendingCounts(
        val tracks: Int = 0, val sessions: Int = 0, val annotations: Int = 0,
        val playlists: Int = 0, val contextPlays: Int = 0, val onlineCollections: Int = 0,
    ) {
        val total: Int get() = tracks + sessions + annotations + playlists + contextPlays + onlineCollections
    }

    private val _lastQuota = MutableStateFlow<HistoryQuota?>(null)

    /** The server's history meter from the most recent acknowledged batch (SY-11). */
    val lastQuota: StateFlow<HistoryQuota?> = _lastQuota.asStateFlow()

    /** Push all pending local rows. Never throws for sync errors. */
    suspend fun syncPending(batchSize: Int = com.pejvak.app.domain.DEFAULT_SYNC_BATCH_SIZE): SyncSummary {
        val summary = runSync(store, transport, batchSize)
        summary.historyQuota?.let { _lastQuota.value = it }
        return summary
    }

    /** Push pending rows, then pull server state. Pull failures never throw. */
    suspend fun syncAll(batchSize: Int = com.pejvak.app.domain.DEFAULT_SYNC_BATCH_SIZE): SyncSummary {
        val summary = syncPending(batchSize)
        try {
            pullFromServer()
            settingsRepository.setLastSyncAt(System.currentTimeMillis())
        } catch (_: Exception) {
            // Best-effort: the app stays usable; the next trigger retries.
        }
        return summary
    }

    suspend fun pendingCounts(): PendingCounts = PendingCounts(
        tracks = trackDao.getPendingSync().size,
        sessions = sessionDao.getPendingSync().size,
        annotations = annotationDao.getPendingSync().size,
        playlists = playlistDao.getPendingSync().size,
        contextPlays = contextPlayDao.getPendingSync().size,
        onlineCollections = onlineCollectionDao.getPendingSync().size,
    )

    suspend fun lastSyncAt(): Long? = settingsRepository.getLastSyncAt()

    /** Restores server-side data so a reinstall / second device keeps history. */
    suspend fun pullFromServer(): PullSummary = coroutineScope {
        val remoteTracks = async { transport.fetchRemoteTracks() }
        val remoteSessions = async { transport.fetchRemoteSessions() }
        val remoteAnnotations = async { transport.fetchRemoteAnnotations() }
        val remotePlaylists = async { transport.fetchRemotePlaylists() }
        val remoteContextPlays = async { transport.fetchRemoteContextPlays() }
        val remoteOnlineCollections = async { transport.fetchRemoteOnlineCollections() }
        val remoteSettings = async { transport.fetchRemoteSettings() }

        val tracks = remoteTracks.await()
        val sessions = remoteSessions.await()
        val annotations = remoteAnnotations.await()
        val playlistRows = remotePlaylists.await()
        val contextPlays = remoteContextPlays.await()
        val onlineCollections = remoteOnlineCollections.await()
        val settings = remoteSettings.await()

        // Tracks first, by contentHash.
        val trackPlan = reconcileTracks(trackDao.getAll().map { it.toDomain() }, tracks)
        for (item in trackPlan.inserts) {
            // Online identity is the hash (sha256("online:source:external")), the
            // same id materialise() writes. A random id here would fork one
            // episode into two rows and split its notes and history.
            val id = if (item.origin == com.pejvak.app.domain.Origin.Online) {
                item.contentHash
            } else {
                java.util.UUID.randomUUID().toString()
            }
            val local = Track(
                id = id,
                serverId = item.serverId, contentHash = item.contentHash, title = item.title,
                durationSec = item.durationSec, fileSizeBytes = item.fileSizeBytes,
                isAudiobook = item.isAudiobook, author = item.author, narrator = item.narrator,
                artworkUrl = item.artworkUrl,
                origin = item.origin, syncStatus = SyncStatus.Synced,
                sourceId = item.sourceId, externalId = item.externalId,
                collectionKey = item.collectionKey, collectionTitle = item.collectionTitle,
                createdAt = System.currentTimeMillis(), updatedAt = System.currentTimeMillis(),
            )
            trackDao.insertIgnore(local.toEntity())
        }
        for (item in trackPlan.backfill) trackDao.markSynced(item.id, item.serverId)
        for (item in trackPlan.originRepairs) trackDao.setOrigin(item.id, item.origin.wire)
        for (item in trackPlan.onlineIdentityRepairs) {
            trackDao.setOnlineIdentity(
                item.id,
                item.sourceId,
                item.externalId,
                item.collectionKey,
                item.collectionTitle,
                item.artworkUrl,
            )
        }

        // Sessions, by clientId. Resolve trackId from the contentHash.
        val tracksByHash = trackDao.getAll().associateBy { it.content_hash }
        val sessionPlan = reconcileSessions(sessionDao.getAll().map { it.toDomain() }, sessions)
        for (item in sessionPlan.inserts) {
            val id = item.clientId ?: item.serverId
            val trackId = tracksByHash[item.contentHash]?.id ?: continue
            val session = Session(
                id = id, serverId = item.serverId, trackId = trackId, contentHash = item.contentHash,
                startedAt = item.startedAt, endedAt = item.endedAt,
                startPositionSec = item.startPositionSec, endPositionSec = item.endPositionSec,
                durationListenedSec = item.durationListenedSec, playbackSpeed = item.playbackSpeed,
                completed = item.completed, interrupted = item.interrupted,
                contextPlayId = item.contextPlayId, contextType = item.contextType, contextKey = item.contextKey,
                stretchId = item.stretchId ?: id, seeked = item.seeked,
                contextTitle = item.contextTitle, collectionSort = item.collectionSort,
                collectionSortDirection = item.collectionSortDirection,
                collectionIndex = item.collectionIndex, collectionSize = item.collectionSize,
                ambientTone = item.ambientTone, ambientLevel = item.ambientLevel,
                volumePercent = item.volumePercent, enhancerEnabled = item.enhancerEnabled,
                enhancerBoostDb = item.enhancerBoostDb, enhancerBassDb = item.enhancerBassDb,
                enhancerTrebleDb = item.enhancerTrebleDb,
                syncStatus = SyncStatus.Synced, createdAt = item.startedAt, updatedAt = item.endedAt ?: item.startedAt,
            )
            sessionDao.insertIgnore(session.toEntity())
        }
        for (item in sessionPlan.backfill) sessionDao.markSynced(item.id, item.serverId)

        // Runs after sessions so a session's contextPlayId names a row already here.
        val contextPlan = reconcileContextPlays(contextPlayDao.getAll().map { it.toDomain() }, contextPlays)
        for (item in contextPlan.inserts) {
            val run = ContextPlay(
                id = item.clientId ?: item.serverId, serverId = item.serverId,
                contextType = item.contextType, contextKey = item.contextKey, contextTitle = item.contextTitle,
                trackCount = item.trackCount, startedAt = item.startedAt, endedAt = item.endedAt,
                lastIndex = item.lastIndex, lastTrackId = item.lastTrackId, lastPositionSec = item.lastPositionSec,
                listenedSec = item.listenedSec, finishedCount = item.finishedCount,
                completed = item.completed, interrupted = item.interrupted,
                syncStatus = SyncStatus.Synced, createdAt = item.startedAt, updatedAt = item.updatedAt,
            )
            contextPlayDao.insertIgnore(run.toEntity())
        }
        for (item in contextPlan.backfill) contextPlayDao.markSynced(item.id, item.serverId)

        // Annotations: inserts + LWW updates + backfill.
        val annotationPlan = reconcileAnnotations(annotationDao.getAll().map { it.toDomain() }, annotations)
        for (item in annotationPlan.inserts) {
            val id = item.clientId ?: item.serverId
            val trackId = tracksByHash[item.contentHash]?.id ?: continue
            val annotation = Annotation(
                id = id, serverId = item.serverId, trackId = trackId, contentHash = item.contentHash,
                positionSec = item.positionSec, text = item.text, tags = item.tags, color = item.color,
                syncStatus = SyncStatus.Synced, createdAt = item.updatedAt, updatedAt = item.updatedAt,
            )
            annotationDao.insertIgnore(annotation.toEntity())
        }
        for (item in annotationPlan.updates) {
            annotationDao.applyRemoteUpdate(item.id, item.text, json.encodeToString(item.tags), item.color, item.updatedAt, item.serverId)
        }
        for (item in annotationPlan.backfill) annotationDao.markSynced(item.id, item.serverId)

        // Playlist items carry server track ids; resolve them to local track ids.
        val tracksByServerId = trackDao.getAll().filter { it.server_id != null }.associate { it.server_id!! to it.id }
        val resolvedPlaylists = playlistRows.map { row ->
            RemotePlaylist(
                serverId = row.serverId, clientId = row.clientId, title = row.title,
                description = row.description, isPublic = row.isPublic,
                items = row.items.mapNotNull { item -> tracksByServerId[item.serverTrackId]?.let { PlaylistItem(it, item.order) } },
                updatedAt = row.updatedAt,
            )
        }
        val playlistPlan = reconcilePlaylists(playlistDao.getAll().map { it.toDomain() }, resolvedPlaylists)
        for (item in playlistPlan.inserts) {
            val playlist = Playlist(
                id = item.clientId ?: item.serverId, serverId = item.serverId, title = item.title,
                description = item.description, isPublic = item.isPublic, items = item.items,
                syncStatus = SyncStatus.Synced, createdAt = item.updatedAt, updatedAt = item.updatedAt,
            )
            playlistDao.insertIgnore(playlist.toEntity())
        }
        for (item in playlistPlan.updates) {
            playlistDao.applyRemoteUpdate(
                item.id, item.title, item.description, item.isPublic,
                json.encodeToString(item.items.map { mapOf("trackId" to it.trackId, "order" to it.order) }),
                item.updatedAt, item.serverId,
            )
        }
        for (item in playlistPlan.backfill) playlistDao.markSynced(item.id, item.serverId)

        // Online collections last; an address needs no parent row on this device.
        val collectionPlan = reconcileOnlineCollections(onlineCollectionDao.getAll().map { it.toDomain() }, onlineCollections)
        for (item in collectionPlan.inserts) {
            val collection = OnlineCollection(
                key = item.clientId ?: "${item.sourceId}:${item.externalId}", serverId = item.serverId,
                sourceId = item.sourceId, externalId = item.externalId, title = item.title,
                subtitle = item.subtitle, artworkUrl = item.artworkUrl, languageCode = item.languageCode,
                trackCount = item.trackCount, pageUrl = item.pageUrl, isFavorite = item.isFavorite,
                lastOpenedAt = item.lastOpenedAt, syncStatus = SyncStatus.Synced,
                createdAt = item.updatedAt, updatedAt = item.updatedAt,
            )
            onlineCollectionDao.insertIgnore(collection.toEntity())
        }
        for (item in collectionPlan.updates) {
            onlineCollectionDao.applyRemoteUpdate(
                item.id, item.title, item.subtitle, item.artworkUrl, item.trackCount,
                item.pageUrl, item.isFavorite, item.lastOpenedAt, item.updatedAt, item.serverId,
            )
        }
        for (item in collectionPlan.backfill) onlineCollectionDao.markSynced(item.id, item.serverId)

        if (settings != null) {
            runCatching { settingsRepository.applyRemoteSettings(settings) }
        }

        PullSummary(
            tracks = trackPlan.inserts.size,
            sessions = sessionPlan.inserts.size,
            annotations = annotationPlan.inserts.size + annotationPlan.updates.size,
            playlists = playlistPlan.inserts.size + playlistPlan.updates.size,
            contextPlays = contextPlan.inserts.size,
            onlineCollections = collectionPlan.inserts.size + collectionPlan.updates.size,
        )
    }
}