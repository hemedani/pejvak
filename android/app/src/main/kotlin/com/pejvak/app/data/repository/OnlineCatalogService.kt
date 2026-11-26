package com.pejvak.app.data.repository

import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.hashOnlineIdentity
import com.pejvak.app.domain.online.OnlineCollectionInfo
import com.pejvak.app.domain.online.OnlineErrorCode
import com.pejvak.app.domain.online.OnlineListOptions
import com.pejvak.app.domain.online.OnlineSourceException
import com.pejvak.app.domain.online.OnlineTrackInfo
import com.pejvak.app.domain.online.parseCollectionKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The only reader of online catalogues (mirrors OnlineCatalogService.ts). Lists are
 * cached for five minutes; a network failure falls back to the saved shelf rather
 * than failing the screen. Opening a collection materialises ordinary track rows —
 * identity is the source's own id, never the signed URL.
 */
@Singleton
class OnlineCatalogService @Inject constructor(
    private val registry: OnlineRegistry,
    private val collections: OnlineCollectionRepository,
    private val trackDao: TrackDao,
) {
    data class CollectionListResult(
        val collections: List<OnlineCollectionInfo>,
        val fromCache: Boolean = false,
        val error: OnlineSourceException? = null,
    )

    data class LoadedCollection(
        val info: OnlineCollectionInfo,
        val tracks: List<OnlineTrackInfo>,
        val fromCache: Boolean = false,
    )

    private data class CacheEntry(val at: Long, val items: List<OnlineCollectionInfo>)

    private val cache = mutableMapOf<String, CacheEntry>()
    private val mutex = Mutex()

    fun sources() = registry.sources

    fun source(sourceId: String) = registry.source(sourceId)

    fun sourcesForLanguage(languageCode: String) = registry.sourcesForLanguage(languageCode)

    suspend fun browse(sourceId: String, languageCode: String? = null): CollectionListResult {
        val adapter = registry.adapter(sourceId)
            ?: return CollectionListResult(emptyList(), error = OnlineSourceException("Unknown source: $sourceId", OnlineErrorCode.NotFound))
        val cacheKey = "$sourceId|${languageCode.orEmpty()}"
        val cached = mutex.withLock { cache[cacheKey] }
        if (cached != null && now() - cached.at < CACHE_TTL_MS) {
            return CollectionListResult(cached.items, fromCache = true)
        }
        return try {
            val items = withContext(Dispatchers.Default) {
                adapter.listCollections(OnlineListOptions(languageCode))
            }
            mutex.withLock { cache[cacheKey] = CacheEntry(now(), items) }
            CollectionListResult(items)
        } catch (error: OnlineSourceException) {
            val fallback = savedFor(sourceId)
            if (fallback.isNotEmpty()) CollectionListResult(fallback, fromCache = true, error = error)
            else CollectionListResult(emptyList(), error = error)
        }
    }

    suspend fun search(sourceId: String, query: String, languageCode: String? = null): CollectionListResult {
        val adapter = registry.adapter(sourceId)
            ?: return CollectionListResult(emptyList(), error = OnlineSourceException("Unknown source: $sourceId", OnlineErrorCode.NotFound))
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return browse(sourceId, languageCode)
        return try {
            CollectionListResult(
                withContext(Dispatchers.Default) {
                    adapter.searchCollections(trimmed, OnlineListOptions(languageCode))
                },
            )
        } catch (error: OnlineSourceException) {
            CollectionListResult(emptyList(), error = error)
        }
    }

    /** One saved collection as catalogue info, used by Continue cards while offline. */
    suspend fun findCollection(key: String): OnlineCollectionInfo? {
        collections.get(key)?.let { saved ->
            return OnlineCollectionInfo(
                key = saved.key,
                sourceId = saved.sourceId,
                externalId = saved.externalId,
                title = saved.title,
                subtitle = saved.subtitle,
                artworkUrl = saved.artworkUrl,
                trackCount = saved.trackCount,
                languageCode = saved.languageCode,
                pageUrl = saved.pageUrl,
            )
        }
        val (sourceId, externalId) = parseCollectionKey(key) ?: return null
        val adapter = registry.adapter(sourceId) ?: return null
        return try {
            withContext(Dispatchers.Default) { adapter.getCollection(externalId) }
        } catch (_: OnlineSourceException) {
            null
        }
    }

    /**
     * Loads a collection's tracks and materialises them. `key` is sourceId:externalId.
     * Falls back to the saved row when the source's detail lookup fails, but the
     * track list itself always comes from the network.
     */
    suspend fun loadCollection(key: String, languageCodeHint: String? = null): LoadedCollection {
        val (sourceId, externalId) = parseCollectionKey(key)
            ?: throw OnlineSourceException("Bad collection key: $key", OnlineErrorCode.NotFound)
        val adapter = registry.adapter(sourceId)
            ?: throw OnlineSourceException("Unknown source: $sourceId", OnlineErrorCode.NotFound)
        val tracks = withContext(Dispatchers.Default) { adapter.getTracks(key) }
        if (tracks.isEmpty()) throw OnlineSourceException("Collection is empty or gone", OnlineErrorCode.NotFound)
        val saved = collections.get(key)
        val info = withContext(Dispatchers.Default) { adapter.getCollection(externalId) }
            ?: OnlineCollectionInfo(
                key = key,
                sourceId = sourceId,
                externalId = externalId,
                // The track metadata is the source's own title; the key's tail is
                // an identifier, not a name. Prefer it over a stale saved title.
                title = tracks.firstNotNullOfOrNull { it.albumTitle?.takeIf(String::isNotBlank) }
                    ?: saved?.title ?: key.substringAfter(':'),
                subtitle = tracks.firstNotNullOfOrNull { it.artist?.takeIf(String::isNotBlank) }
                    ?: saved?.subtitle,
                artworkUrl = saved?.artworkUrl ?: tracks.firstOrNull()?.artworkUrl,
                trackCount = tracks.size,
                languageCode = saved?.languageCode ?: languageCodeHint ?: adapter.source.languageCode,
                pageUrl = saved?.pageUrl ?: tracks.firstOrNull()?.pageUrl,
            )
        val resolved = info.copy(trackCount = tracks.size)
        collections.save(resolved, resolved.languageCode)
        materialise(resolved, tracks)
        return LoadedCollection(resolved, tracks)
    }

    /** Tracks already materialised for a collection, ordered by track number. */
    suspend fun tracksForCollection(key: String): List<Track> = withContext(Dispatchers.IO) {
        trackDao.getByCollectionKey(key).map { it.toDomain() }
    }

    /**
     * The playable version of [track]. Online sources sign their media URLs with
     * an expiry, so the stored URL is a cache that must be re-resolved before it
     * is trusted; a local track is returned untouched. A resolution failure falls
     * back to the stored URL rather than blocking playback outright.
     */
    suspend fun resolveTrack(track: Track): Track {
        if (track.origin != Origin.Online) return track
        val key = track.collectionKey ?: return track
        val fresh = runCatching { resolveStreamUrls(key) }.getOrNull() ?: return track
        val byExternal = track.externalId?.let { external -> fresh.firstOrNull { it.externalId == external } }
        if (byExternal == null) return track
        return track.copy(
            fileUri = track.downloadPath ?: byExternal.streamUrl,
            streamUrl = byExternal.streamUrl,
            durationSec = if (byExternal.durationSec > 0) byExternal.durationSec else track.durationSec,
            artworkUrl = byExternal.artworkUrl ?: track.artworkUrl,
        )
    }

    /**
     * Re-resolves signed stream URLs for every track in a collection and stores them
     * on the rows. Called before playback of a stale cache and before downloading.
     */
    suspend fun resolveStreamUrls(key: String): List<OnlineTrackInfo> {
        val (sourceId, _) = parseCollectionKey(key)
            ?: throw OnlineSourceException("Bad collection key: $key", OnlineErrorCode.NotFound)
        val adapter = registry.adapter(sourceId)
            ?: throw OnlineSourceException("Unknown source: $sourceId", OnlineErrorCode.NotFound)
        val tracks = withContext(Dispatchers.Default) { adapter.getTracks(key) }
        val now = System.currentTimeMillis()
        withContext(Dispatchers.IO) {
            for (item in tracks) {
                val hash = hashOnlineIdentity(sourceId, item.externalId)
                val existing = trackDao.getByContentHash(hash) ?: continue
                val stream = item.streamUrl
                trackDao.upsert(
                    existing.copy(
                        stream_url = stream,
                        file_uri = existing.download_path ?: stream,
                        duration_sec = if (item.durationSec > 0) item.durationSec else existing.duration_sec,
                        updated_at = now,
                    ),
                )
            }
        }
        return tracks
    }

    private suspend fun savedFor(sourceId: String): List<OnlineCollectionInfo> =
        withContext(Dispatchers.IO) {
            collections.getBySource(sourceId).map { saved ->
                OnlineCollectionInfo(
                    key = saved.key,
                    sourceId = saved.sourceId,
                    externalId = saved.externalId,
                    title = saved.title,
                    subtitle = saved.subtitle,
                    artworkUrl = saved.artworkUrl,
                    trackCount = saved.trackCount,
                    languageCode = saved.languageCode,
                    pageUrl = saved.pageUrl,
                )
            }
        }

    private suspend fun materialise(info: OnlineCollectionInfo, tracks: List<OnlineTrackInfo>) {
        val now = System.currentTimeMillis()
        withContext(Dispatchers.IO) {
            for (item in tracks) {
                val hash = hashOnlineIdentity(info.sourceId, item.externalId)
                // Match on the hash, not the primary key: rows written by an older
                // sync pull may carry a random id, and inserting the hash as a
                // second row would fork the episode and its notes.
                val prev = trackDao.getByContentHash(hash)?.toDomain()
                val row = Track(
                    id = prev?.id ?: hash,
                    contentHash = hash,
                    title = item.title.ifBlank { "Track ${item.order}" },
                    fileName = prev?.fileName,
                    fileUri = prev?.downloadPath ?: item.streamUrl,
                    durationSec = if (item.durationSec > 0) item.durationSec else (prev?.durationSec ?: 0),
                    fileSizeBytes = prev?.fileSizeBytes ?: 0,
                    mimeType = prev?.mimeType,
                    isAudiobook = true,
                    author = item.artist ?: prev?.author,
                    narrator = prev?.narrator,
                    artworkUrl = item.artworkUrl ?: info.artworkUrl ?: prev?.artworkUrl,
                    totalPlayCount = prev?.totalPlayCount ?: 0,
                    totalListenTimeSec = prev?.totalListenTimeSec ?: 0,
                    lastPlayedAt = prev?.lastPlayedAt,
                    syncStatus = prev?.syncStatus ?: com.pejvak.app.domain.SyncStatus.Pending,
                    createdAt = prev?.createdAt ?: now,
                    updatedAt = now,
                    album = item.albumTitle ?: prev?.album,
                    trackNumber = item.order,
                    availability = Availability.Present,
                    origin = Origin.Online,
                    streamUrl = item.streamUrl,
                    sourceId = info.sourceId,
                    externalId = item.externalId,
                    collectionKey = info.key,
                    collectionTitle = info.title,
                    downloadedAt = prev?.downloadedAt,
                    downloadPath = prev?.downloadPath,
                )
                trackDao.upsert(row.toEntity())
            }
        }
    }

    private fun now() = System.currentTimeMillis()

    private companion object {
        const val CACHE_TTL_MS = 5 * 60 * 1000L
    }
}
