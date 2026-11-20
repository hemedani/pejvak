package com.pejvak.app.domain

/**
 * Pull reconciliation (mirrors mobile/src/lib/reconcile.ts). Tracks match by
 * contentHash; sessions/runs/annotations/playlists by clientId (INSERT OR IGNORE);
 * annotations/playlists/collections use last-write-wins on updatedAt; a local
 * tombstone is never resurrected. Pure — no DB, no network.
 */

data class RemoteTrack(
    val serverId: String,
    val contentHash: String,
    val title: String,
    val durationSec: Int,
    val fileSizeBytes: Long,
    val isAudiobook: Boolean,
    val author: String?,
    val narrator: String?,
    val origin: Origin,
    val artworkUrl: String? = null,
    val sourceId: String? = null,
    val externalId: String? = null,
    val collectionKey: String? = null,
    val collectionTitle: String? = null,
)

data class RemoteSession(
    val serverId: String,
    val clientId: String?,
    val contentHash: String,
    val startedAt: Long,
    val endedAt: Long?,
    val startPositionSec: Int,
    val endPositionSec: Int?,
    val durationListenedSec: Int,
    val playbackSpeed: Double,
    val completed: Boolean,
    val interrupted: Boolean,
    val contextPlayId: String?,
    val contextType: ContextType?,
    val contextKey: String?,
    val stretchId: String?,
    val seeked: Boolean,
    val contextTitle: String? = null,
    val collectionSort: CollectionSort? = null,
    val collectionSortDirection: SortDirection? = null,
    val collectionIndex: Int? = null,
    val collectionSize: Int? = null,
    val ambientTone: String? = null,
    val ambientLevel: Int? = null,
    val volumePercent: Int? = null,
    val enhancerEnabled: Boolean? = null,
    val enhancerBoostDb: Double? = null,
    val enhancerBassDb: Double? = null,
    val enhancerTrebleDb: Double? = null,
)

data class RemoteContextPlay(
    val serverId: String,
    val clientId: String?,
    val contextType: ContextType,
    val contextKey: String,
    val contextTitle: String,
    val trackCount: Int,
    val startedAt: Long,
    val endedAt: Long?,
    val lastIndex: Int,
    val lastTrackId: String?,
    val lastPositionSec: Int,
    val listenedSec: Int,
    val finishedCount: Int,
    val completed: Boolean,
    val interrupted: Boolean,
    val updatedAt: Long,
)

data class RemoteAnnotation(
    val serverId: String,
    val clientId: String?,
    val contentHash: String,
    val positionSec: Int,
    val text: String,
    val tags: List<String>,
    val color: String?,
    val updatedAt: Long,
)

data class RemotePlaylist(
    val serverId: String,
    val clientId: String?,
    val title: String,
    val description: String?,
    val isPublic: Boolean,
    /** Server track ids already resolved to local track ids by the caller. */
    val items: List<PlaylistItem>,
    val updatedAt: Long,
)

data class RemoteOnlineCollection(
    val serverId: String,
    val clientId: String?,
    val sourceId: String,
    val externalId: String,
    val title: String,
    val subtitle: String?,
    val artworkUrl: String?,
    val languageCode: String,
    val trackCount: Int,
    val pageUrl: String?,
    val isFavorite: Boolean,
    val lastOpenedAt: Long?,
    val updatedAt: Long,
)

data class Backfill(val id: String, val serverId: String)
data class OriginRepair(val id: String, val origin: Origin)

/**
 * Fills in the online address of a row pulled before the sync asked for it. Without
 * it the row has no source to re-resolve a signed URL from, so it cannot play.
 */
data class OnlineIdentityRepair(
    val id: String,
    val sourceId: String,
    val externalId: String,
    val collectionKey: String?,
    val collectionTitle: String?,
    val artworkUrl: String?,
)

data class AnnotationUpdate(
    val id: String, val serverId: String, val text: String,
    val tags: List<String>, val color: String?, val updatedAt: Long,
)

data class PlaylistUpdate(
    val id: String, val serverId: String, val title: String, val description: String?,
    val isPublic: Boolean, val items: List<PlaylistItem>, val updatedAt: Long,
)

data class OnlineCollectionUpdate(
    val id: String, val serverId: String, val title: String, val subtitle: String?,
    val artworkUrl: String?, val trackCount: Int, val pageUrl: String?,
    val isFavorite: Boolean, val lastOpenedAt: Long?, val updatedAt: Long,
)

data class TrackReconcileResult(
    val inserts: List<RemoteTrack>,
    val backfill: List<Backfill>,
    val originRepairs: List<OriginRepair>,
    val onlineIdentityRepairs: List<OnlineIdentityRepair> = emptyList(),
)
data class AppendReconcileResult<T>(val inserts: List<T>, val backfill: List<Backfill>)
data class AnnotationReconcileResult(val inserts: List<RemoteAnnotation>, val updates: List<AnnotationUpdate>, val backfill: List<Backfill>)
data class PlaylistReconcileResult(val inserts: List<RemotePlaylist>, val updates: List<PlaylistUpdate>, val backfill: List<Backfill>)
data class OnlineCollectionReconcileResult(val inserts: List<RemoteOnlineCollection>, val updates: List<OnlineCollectionUpdate>, val backfill: List<Backfill>)

private fun remoteLocalId(clientId: String?, serverId: String): String = clientId ?: serverId

/**
 * Tracks match by contentHash. originRepairs corrects rows the pull used to file
 * as local because it never asked for origin — the server is the only authority.
 */
fun reconcileTracks(local: List<Track>, remote: List<RemoteTrack>): TrackReconcileResult {
    val byHash = local.associateBy { it.contentHash }
    val inserts = mutableListOf<RemoteTrack>()
    val backfill = mutableListOf<Backfill>()
    val originRepairs = mutableListOf<OriginRepair>()
    val onlineIdentityRepairs = mutableListOf<OnlineIdentityRepair>()
    for (item in remote) {
        val existing = byHash[item.contentHash]
        if (existing == null) {
            inserts.add(item)
            continue
        }
        if (existing.serverId == null) backfill.add(Backfill(existing.id, item.serverId))
        if (existing.origin != item.origin) originRepairs.add(OriginRepair(existing.id, item.origin))
        if (item.origin == Origin.Online && existing.sourceId == null && item.sourceId != null && item.externalId != null) {
            onlineIdentityRepairs.add(
                OnlineIdentityRepair(
                    existing.id,
                    item.sourceId,
                    item.externalId,
                    item.collectionKey,
                    item.collectionTitle,
                    item.artworkUrl,
                ),
            )
        }
    }
    return TrackReconcileResult(inserts, backfill, originRepairs, onlineIdentityRepairs)
}

/** Sessions are append-only; deduped by clientId so re-pulls never duplicate. */
fun reconcileSessions(local: List<Session>, remote: List<RemoteSession>): AppendReconcileResult<RemoteSession> {
    val byId = local.associateBy { it.id }
    val inserts = mutableListOf<RemoteSession>()
    val backfill = mutableListOf<Backfill>()
    for (item in remote) {
        val id = remoteLocalId(item.clientId, item.serverId)
        val existing = byId[id]
        if (existing == null) inserts.add(item)
        else if (existing.serverId == null) backfill.add(Backfill(id, item.serverId))
    }
    return AppendReconcileResult(inserts, backfill)
}

/** Runs dedupe by clientId, like sessions — written once when ended, never edited. */
fun reconcileContextPlays(local: List<ContextPlay>, remote: List<RemoteContextPlay>): AppendReconcileResult<RemoteContextPlay> {
    val byId = local.associateBy { it.id }
    val inserts = mutableListOf<RemoteContextPlay>()
    val backfill = mutableListOf<Backfill>()
    for (item in remote) {
        val id = remoteLocalId(item.clientId, item.serverId)
        val existing = byId[id]
        if (existing == null) inserts.add(item)
        else if (existing.serverId == null) backfill.add(Backfill(id, item.serverId))
    }
    return AppendReconcileResult(inserts, backfill)
}

/** Annotations dedupe by clientId; edits LWW on updatedAt; tombstones never resurrected. */
fun reconcileAnnotations(local: List<Annotation>, remote: List<RemoteAnnotation>): AnnotationReconcileResult {
    val byId = local.associateBy { it.id }
    val inserts = mutableListOf<RemoteAnnotation>()
    val updates = mutableListOf<AnnotationUpdate>()
    val backfill = mutableListOf<Backfill>()
    for (item in remote) {
        val id = remoteLocalId(item.clientId, item.serverId)
        val existing = byId[id]
        if (existing == null) { inserts.add(item); continue }
        if (existing.deletedAt != null) continue
        if (item.updatedAt > existing.updatedAt) {
            updates.add(AnnotationUpdate(id, item.serverId, item.text, item.tags, item.color, item.updatedAt))
            continue
        }
        if (existing.serverId == null) backfill.add(Backfill(id, item.serverId))
    }
    return AnnotationReconcileResult(inserts, updates, backfill)
}

/** Playlists dedupe by clientId; edits LWW on updatedAt; tombstones never resurrected. */
fun reconcilePlaylists(local: List<Playlist>, remote: List<RemotePlaylist>): PlaylistReconcileResult {
    val byId = local.associateBy { it.id }
    val inserts = mutableListOf<RemotePlaylist>()
    val updates = mutableListOf<PlaylistUpdate>()
    val backfill = mutableListOf<Backfill>()
    for (item in remote) {
        val id = remoteLocalId(item.clientId, item.serverId)
        val existing = byId[id]
        if (existing == null) { inserts.add(item); continue }
        if (existing.deletedAt != null) continue
        if (item.updatedAt > existing.updatedAt) {
            updates.add(PlaylistUpdate(id, item.serverId, item.title, item.description, item.isPublic, item.items, item.updatedAt))
            continue
        }
        if (existing.serverId == null) backfill.add(Backfill(id, item.serverId))
    }
    return PlaylistReconcileResult(inserts, updates, backfill)
}

/**
 * Online collections dedupe by key (clientId, else sourceId:externalId); edits LWW;
 * tombstones never resurrected — a removal is a decision, not a gap.
 */
fun reconcileOnlineCollections(local: List<OnlineCollection>, remote: List<RemoteOnlineCollection>): OnlineCollectionReconcileResult {
    val byKey = local.associateBy { it.key }
    val inserts = mutableListOf<RemoteOnlineCollection>()
    val updates = mutableListOf<OnlineCollectionUpdate>()
    val backfill = mutableListOf<Backfill>()
    for (item in remote) {
        val key = item.clientId ?: "${item.sourceId}:${item.externalId}"
        val existing = byKey[key]
        if (existing == null) { inserts.add(item); continue }
        if (existing.deletedAt != null) continue
        if (item.updatedAt > existing.updatedAt) {
            updates.add(OnlineCollectionUpdate(key, item.serverId, item.title, item.subtitle, item.artworkUrl, item.trackCount, item.pageUrl, item.isFavorite, item.lastOpenedAt, item.updatedAt))
            continue
        }
        if (existing.serverId == null) backfill.add(Backfill(key, item.serverId))
    }
    return OnlineCollectionReconcileResult(inserts, updates, backfill)
}