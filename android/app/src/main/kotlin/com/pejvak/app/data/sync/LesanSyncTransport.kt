package com.pejvak.app.data.sync

import com.pejvak.app.data.auth.AuthSession
import com.pejvak.app.data.remote.LesanClient
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.ContextPlaySyncPayload
import com.pejvak.app.domain.HistoryQuota
import com.pejvak.app.domain.IdMapping
import com.pejvak.app.domain.OnlineCollectionSyncPayload
import com.pejvak.app.domain.PlaylistSyncPayload
import com.pejvak.app.domain.RegisterTrackResult
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SharedSettings
import com.pejvak.app.domain.SyncLocalDataResult
import com.pejvak.app.domain.SyncTransport
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.normalizeSharedSettings
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The Lesan wire transport for sync (mirrors SyncService.ts registerTrack +
 * syncLocalData + the pull fetches). Only http(s) artwork is synced — a local
 * file:// cover path means nothing to another device.
 */
@Singleton
class LesanSyncTransport @Inject constructor(
    private val lesan: LesanClient,
    private val authSession: AuthSession,
) : SyncTransport {

    private fun token(): String? = authSession.current()

    private fun isRemoteArtwork(url: String?): Boolean =
        url != null && (url.startsWith("http://") || url.startsWith("https://"))

    override suspend fun registerTrack(track: Track): RegisterTrackResult {
        val set = buildJsonObject {
            put("title", track.title)
            put("contentHash", track.contentHash)
            put("durationSec", track.durationSec)
            put("fileSizeBytes", track.fileSizeBytes)
            put("isAudiobook", track.isAudiobook)
            put("origin", track.origin.wire)
            track.fileName?.let { put("fileName", it) }
            track.mimeType?.let { put("mimeType", it) }
            track.author?.let { put("author", it) }
            track.narrator?.let { put("narrator", it) }
            if (isRemoteArtwork(track.artworkUrl)) put("artworkUrl", track.artworkUrl!!)
            track.sourceId?.let { put("sourceId", it) }
            track.externalId?.let { put("externalId", it) }
            track.collectionKey?.let { put("collectionKey", it) }
            track.collectionTitle?.let { put("collectionTitle", it) }
            track.downloadedAt?.let { put("downloadedAt", it) }
        }
        val get = buildJsonObject { put("_id", 1); put("title", 1); put("contentHash", 1) }
        val body = lesan.callBody("track", "registerTrack", set, get, token = token())
        return RegisterTrackResult(body.jsonObject["_id"]?.jsonPrimitive?.contentOrNull)
    }

    override suspend fun syncLocalData(
        sessions: List<Session>,
        annotations: List<Annotation>,
        playlists: List<PlaylistSyncPayload>,
        contextPlays: List<ContextPlaySyncPayload>,
        onlineCollections: List<OnlineCollectionSyncPayload>,
        settings: SharedSettings?,
    ): SyncLocalDataResult {
        val set = buildJsonObject {
            put("contextPlays", JsonArray(contextPlays.map { run ->
                buildJsonObject {
                    put("clientId", run.clientId); put("contextType", run.contextType.wire)
                    put("contextKey", run.contextKey); put("contextTitle", run.contextTitle)
                    put("trackCount", run.trackCount); put("startedAt", run.startedAt); put("endedAt", run.endedAt)
                    put("lastIndex", run.lastIndex); put("lastPositionSec", run.lastPositionSec)
                    put("listenedSec", run.listenedSec); put("finishedCount", run.finishedCount)
                    put("completed", run.completed); put("interrupted", run.interrupted); put("updatedAt", run.updatedAt)
                    run.lastTrackId?.let { put("lastTrackId", it) }
                }
            }))
            put("onlineCollections", JsonArray(onlineCollections.map { saved ->
                buildJsonObject {
                    put("clientId", saved.clientId); put("sourceId", saved.sourceId); put("externalId", saved.externalId)
                    put("title", saved.title); put("languageCode", saved.languageCode); put("trackCount", saved.trackCount)
                    put("isFavorite", saved.isFavorite); put("updatedAt", saved.updatedAt); put("deleted", saved.deleted)
                    saved.subtitle?.let { put("subtitle", it) }
                    saved.artworkUrl?.let { put("artworkUrl", it) }
                    saved.pageUrl?.let { put("pageUrl", it) }
                    saved.lastOpenedAt?.let { put("lastOpenedAt", it) }
                }
            }))
            put("playlists", JsonArray(playlists.map { playlist ->
                buildJsonObject {
                    put("clientId", playlist.clientId); put("title", playlist.title)
                    playlist.description?.let { put("description", it) }
                    put("isPublic", playlist.isPublic)
                    put("items", JsonArray(playlist.items.map { item ->
                        buildJsonObject { put("contentHash", item.contentHash); put("order", item.order) }
                    }))
                    put("updatedAt", playlist.updatedAt); put("deleted", playlist.deleted)
                }
            }))
            put("sessions", JsonArray(sessions.map { session ->
                buildJsonObject {
                    put("clientId", session.id); put("contentHash", session.contentHash)
                    put("startedAt", session.startedAt); put("startPositionSec", session.startPositionSec)
                    put("endPositionSec", session.endPositionSec ?: session.startPositionSec)
                    put("durationListenedSec", session.durationListenedSec); put("playbackSpeed", session.playbackSpeed)
                    put("completed", session.completed); put("interrupted", session.interrupted)
                    session.endedAt?.let { put("endedAt", it) }
                    session.deviceInfo?.let { put("deviceInfo", it) }
                    session.contextPlayId?.let { put("contextPlayId", it) }
                    session.contextType?.let { put("contextType", it.wire) }
                    session.contextKey?.let { put("contextKey", it) }
                    session.contextTitle?.let { put("contextTitle", it) }
                    session.collectionSort?.let { put("collectionSort", it.wire) }
                    session.collectionSortDirection?.let { put("collectionSortDirection", it.wire) }
                    session.collectionIndex?.let { put("collectionIndex", it) }
                    session.collectionSize?.let { put("collectionSize", it) }
                    session.ambientTone?.let { put("ambientTone", it) }
                    session.ambientLevel?.let { put("ambientLevel", it) }
                    session.volumePercent?.let { put("volumePercent", it) }
                    session.enhancerEnabled?.let { put("enhancerEnabled", it) }
                    session.enhancerBoostDb?.let { put("enhancerBoostDb", it) }
                    session.enhancerBassDb?.let { put("enhancerBassDb", it) }
                    session.enhancerTrebleDb?.let { put("enhancerTrebleDb", it) }
                    put("stretchId", session.stretchId); put("seeked", session.seeked)
                }
            }))
            put("annotations", JsonArray(annotations.map { annotation ->
                buildJsonObject {
                    put("clientId", annotation.id); put("contentHash", annotation.contentHash)
                    put("positionSec", annotation.positionSec); put("text", annotation.text)
                    put("tags", JsonArray(annotation.tags.map { JsonPrimitive(it) }))
                    put("updatedAt", annotation.updatedAt); put("deleted", annotation.deletedAt != null)
                    annotation.color?.let { put("color", it) }
                }
            }))
            if (settings != null) {
                put("settings", buildJsonObject {
                    put("languageCode", settings.languageCode)
                    put("defaultSpeed", settings.defaultSpeed)
                    put("historySort", settings.historySort.wire)
                    put("updatedAt", settings.updatedAt)
                })
            }
        }
        val get = buildJsonObject {
            put("syncedSessions", 1); put("syncedAnnotations", 1); put("syncedPlaylists", 1)
            put("syncedContextPlays", 1); put("syncedSettings", 1)
            put("settings", buildJsonObject {
                put("languageCode", 1); put("defaultSpeed", 1); put("historySort", 1); put("updatedAt", 1)
            })
            put("annotations", JsonArray(emptyList()))
            put("playlists", JsonArray(emptyList()))
            put("contextPlays", JsonArray(emptyList()))
            put("onlineCollections", JsonArray(emptyList()))
        }
        val body = lesan.callBody("track", "syncLocalData", set, get, token = token()).jsonObject
        return SyncLocalDataResult(
            syncedSessions = body["syncedSessions"]?.jsonPrimitive?.intOrNull ?: 0,
            syncedAnnotations = body["syncedAnnotations"]?.jsonPrimitive?.intOrNull ?: 0,
            syncedPlaylists = body["syncedPlaylists"]?.jsonPrimitive?.intOrNull ?: 0,
            syncedContextPlays = body["syncedContextPlays"]?.jsonPrimitive?.intOrNull ?: 0,
            syncedOnlineCollections = body["syncedOnlineCollections"]?.jsonPrimitive?.intOrNull ?: 0,
            annotations = parseMappings(body["annotations"]),
            playlists = parseMappings(body["playlists"]),
            contextPlays = parseMappings(body["contextPlays"]),
            onlineCollections = parseMappings(body["onlineCollections"]),
            settings = (body["settings"] as? JsonObject)?.let { parseSharedSettings(it) },
            historyQuota = (body["historyQuota"] as? JsonObject)?.let { parseQuota(it) },
            historySkipped = body["historySkipped"]?.jsonPrimitive?.intOrNull ?: 0,
            crossDeviceSync = body["crossDeviceSync"]?.jsonPrimitive?.booleanOrNull,
        )
    }

    /** `{ limit, used, remaining, unlimited }`; `-1` is unlimited. */
    private fun parseQuota(obj: JsonObject): HistoryQuota? {
        val limit = obj["limit"]?.jsonPrimitive?.intOrNull ?: return null
        val used = obj["used"]?.jsonPrimitive?.intOrNull ?: return null
        return HistoryQuota(
            limit = limit,
            used = used,
            remaining = obj["remaining"]?.jsonPrimitive?.intOrNull ?: (limit - used).coerceAtLeast(0),
            unlimited = obj["unlimited"]?.jsonPrimitive?.booleanOrNull ?: (limit < 0),
        )
    }

    private fun parseMappings(element: JsonElement?): List<IdMapping> {
        val array = element as? JsonArray ?: return emptyList()
        return array.mapNotNull { item ->
            val obj = item as? JsonObject ?: return@mapNotNull null
            val clientId = obj["clientId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            IdMapping(clientId, obj["serverId"]?.jsonPrimitive?.contentOrNull)
        }
    }

    private fun parseSharedSettings(obj: JsonObject): SharedSettings = normalizeSharedSettings(
        languageCode = obj["languageCode"]?.jsonPrimitive?.contentOrNull,
        defaultSpeed = obj["defaultSpeed"]?.jsonPrimitive?.doubleOrNull,
        historySort = obj["historySort"]?.jsonPrimitive?.contentOrNull,
        updatedAt = obj["updatedAt"]?.jsonPrimitive?.longOrNull,
    )

    // --- Pull fetches ---

    /** A playlist row as the server holds it; items carry server track ids. */
    data class RemotePlaylistRow(
        val serverId: String,
        val clientId: String?,
        val title: String,
        val description: String?,
        val isPublic: Boolean,
        val items: List<RemotePlaylistItem>,
        val updatedAt: Long,
    )

    data class RemotePlaylistItem(val serverTrackId: String, val order: Int)

    private fun pageSet() = buildJsonObject { put("page", 1); put("limit", PULL_PAGE_SIZE) }

    suspend fun fetchRemoteTracks(): List<com.pejvak.app.domain.RemoteTrack> {
        val get = buildJsonObject {
            put("_id", 1); put("contentHash", 1); put("title", 1); put("durationSec", 1)
            put("fileSizeBytes", 1); put("isAudiobook", 1); put("author", 1); put("narrator", 1)
            put("origin", 1); put("artworkUrl", 1); put("sourceId", 1); put("externalId", 1)
            put("collectionKey", 1); put("collectionTitle", 1)
        }
        val rows = lesan.callBody("track", "getMyTracks", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val hash = row.str("contentHash") ?: return@mapNotNull null
            val title = row.str("title") ?: return@mapNotNull null
            com.pejvak.app.domain.RemoteTrack(
                serverId = id, contentHash = hash, title = title,
                durationSec = row.int("durationSec") ?: 0,
                fileSizeBytes = row.long("fileSizeBytes") ?: 0,
                isAudiobook = row.bool("isAudiobook") ?: false,
                author = row.str("author"), narrator = row.str("narrator"),
                origin = if (row.str("origin") == "online") com.pejvak.app.domain.Origin.Online else com.pejvak.app.domain.Origin.Local,
                artworkUrl = row.str("artworkUrl"),
                sourceId = row.str("sourceId"),
                externalId = row.str("externalId"),
                collectionKey = row.str("collectionKey"),
                collectionTitle = row.str("collectionTitle"),
            )
        }
    }

    suspend fun fetchRemoteSessions(): List<com.pejvak.app.domain.RemoteSession> {
        val get = buildJsonObject {
            put("_id", 1); put("clientId", 1); put("contentHash", 1); put("startedAt", 1); put("endedAt", 1)
            put("startPositionSec", 1); put("endPositionSec", 1); put("durationListenedSec", 1); put("playbackSpeed", 1)
            put("completed", 1); put("interrupted", 1); put("contextPlayId", 1); put("contextType", 1)
            put("contextKey", 1); put("stretchId", 1); put("seeked", 1)
            put("contextTitle", 1); put("collectionSort", 1); put("collectionSortDirection", 1)
            put("collectionIndex", 1); put("collectionSize", 1); put("ambientTone", 1)
            put("ambientLevel", 1); put("volumePercent", 1); put("enhancerEnabled", 1)
            put("enhancerBoostDb", 1); put("enhancerBassDb", 1); put("enhancerTrebleDb", 1)
            put("track", buildJsonObject { put("contentHash", 1) })
        }
        val rows = lesan.callBody("playbackSession", "getMyListeningHistory", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val hash = row.str("contentHash") ?: (row["track"] as? JsonObject)?.str("contentHash") ?: return@mapNotNull null
            val startedAt = row.long("startedAt") ?: return@mapNotNull null
            com.pejvak.app.domain.RemoteSession(
                serverId = id, clientId = row.str("clientId"), contentHash = hash,
                startedAt = startedAt, endedAt = row.long("endedAt"),
                startPositionSec = row.int("startPositionSec") ?: 0, endPositionSec = row.int("endPositionSec"),
                durationListenedSec = row.int("durationListenedSec") ?: 0, playbackSpeed = row.double("playbackSpeed") ?: 1.0,
                completed = row.bool("completed") ?: false, interrupted = row.bool("interrupted") ?: false,
                contextPlayId = row.str("contextPlayId"),
                contextType = com.pejvak.app.domain.ContextType.from(row.str("contextType")),
                contextKey = row.str("contextKey"), stretchId = row.str("stretchId"), seeked = row.bool("seeked") ?: false,
                contextTitle = row.str("contextTitle"),
                collectionSort = com.pejvak.app.domain.CollectionSort.from(row.str("collectionSort")),
                collectionSortDirection = com.pejvak.app.domain.SortDirection.from(row.str("collectionSortDirection")),
                collectionIndex = row.int("collectionIndex"),
                collectionSize = row.int("collectionSize"),
                ambientTone = row.str("ambientTone"),
                ambientLevel = row.int("ambientLevel"),
                volumePercent = row.int("volumePercent"),
                enhancerEnabled = row.bool("enhancerEnabled"),
                enhancerBoostDb = row.double("enhancerBoostDb"),
                enhancerBassDb = row.double("enhancerBassDb"),
                enhancerTrebleDb = row.double("enhancerTrebleDb"),
            )
        }
    }

    suspend fun fetchRemoteAnnotations(): List<com.pejvak.app.domain.RemoteAnnotation> {
        val get = buildJsonObject {
            put("_id", 1); put("clientId", 1); put("positionSec", 1); put("text", 1); put("tags", 1)
            put("color", 1); put("updatedAt", 1); put("track", buildJsonObject { put("contentHash", 1) })
        }
        val rows = lesan.callBody("annotation", "getMyAnnotations", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val hash = (row["track"] as? JsonObject)?.str("contentHash") ?: return@mapNotNull null
            val positionSec = row.int("positionSec") ?: return@mapNotNull null
            com.pejvak.app.domain.RemoteAnnotation(
                serverId = id, clientId = row.str("clientId"), contentHash = hash,
                positionSec = positionSec, text = row.str("text") ?: "",
                tags = (row["tags"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList(),
                color = row.str("color"), updatedAt = toMillis(row["updatedAt"]),
            )
        }
    }

    suspend fun fetchRemotePlaylists(): List<RemotePlaylistRow> {
        val get = buildJsonObject {
            put("_id", 1); put("clientId", 1); put("title", 1); put("description", 1)
            put("isPublic", 1); put("items", 1); put("updatedAt", 1)
        }
        val rows = lesan.callBody("playlist", "getMyPlaylists", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val title = row.str("title") ?: return@mapNotNull null
            val items = (row["items"] as? JsonArray)?.mapNotNull { item ->
                val obj = item as? JsonObject ?: return@mapNotNull null
                val trackId = obj.str("trackId") ?: return@mapNotNull null
                val order = obj.int("order") ?: return@mapNotNull null
                RemotePlaylistItem(trackId, order)
            } ?: emptyList()
            RemotePlaylistRow(id, row.str("clientId"), title, row.str("description"), row.bool("isPublic") ?: false, items, toMillis(row["updatedAt"]))
        }
    }

    suspend fun fetchRemoteContextPlays(): List<com.pejvak.app.domain.RemoteContextPlay> {
        val get = buildJsonObject {
            put("_id", 1); put("clientId", 1); put("contextType", 1); put("contextKey", 1); put("contextTitle", 1)
            put("trackCount", 1); put("startedAt", 1); put("endedAt", 1); put("lastIndex", 1); put("lastTrackId", 1)
            put("lastPositionSec", 1); put("listenedSec", 1); put("finishedCount", 1); put("completed", 1)
            put("interrupted", 1); put("updatedAt", 1)
        }
        val rows = lesan.callBody("playbackContext", "getMyPlaybackContexts", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val contextType = com.pejvak.app.domain.ContextType.from(row.str("contextType")) ?: return@mapNotNull null
            val contextKey = row.str("contextKey") ?: return@mapNotNull null
            val startedAt = row.long("startedAt") ?: return@mapNotNull null
            val endedAt = row.long("endedAt") ?: return@mapNotNull null
            com.pejvak.app.domain.RemoteContextPlay(
                serverId = id, clientId = row.str("clientId"), contextType = contextType,
                contextKey = contextKey, contextTitle = row.str("contextTitle") ?: contextKey,
                trackCount = row.int("trackCount") ?: 0, startedAt = startedAt, endedAt = endedAt,
                lastIndex = row.int("lastIndex") ?: 0, lastTrackId = row.str("lastTrackId"),
                lastPositionSec = row.int("lastPositionSec") ?: 0, listenedSec = row.int("listenedSec") ?: 0,
                finishedCount = row.int("finishedCount") ?: 0, completed = row.bool("completed") ?: false,
                interrupted = row.bool("interrupted") ?: false, updatedAt = toMillis(row["updatedAt"]),
            )
        }
    }

    suspend fun fetchRemoteOnlineCollections(): List<com.pejvak.app.domain.RemoteOnlineCollection> {
        val get = buildJsonObject {
            put("_id", 1); put("clientId", 1); put("sourceId", 1); put("externalId", 1); put("title", 1)
            put("subtitle", 1); put("artworkUrl", 1); put("languageCode", 1); put("trackCount", 1)
            put("pageUrl", 1); put("isFavorite", 1); put("lastOpenedAt", 1); put("updatedAt", 1)
        }
        val rows = lesan.callBody("onlineCollection", "getMyOnlineCollections", pageSet(), get, token = token()).jsonArray
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val id = row.str("_id") ?: return@mapNotNull null
            val sourceId = row.str("sourceId") ?: return@mapNotNull null
            val externalId = row.str("externalId") ?: return@mapNotNull null
            val title = row.str("title") ?: return@mapNotNull null
            com.pejvak.app.domain.RemoteOnlineCollection(
                serverId = id, clientId = row.str("clientId"), sourceId = sourceId, externalId = externalId,
                title = title, subtitle = row.str("subtitle"), artworkUrl = row.str("artworkUrl"),
                languageCode = row.str("languageCode") ?: "und", trackCount = row.int("trackCount") ?: 0,
                pageUrl = row.str("pageUrl"), isFavorite = row.bool("isFavorite") ?: false,
                lastOpenedAt = row.long("lastOpenedAt"), updatedAt = toMillis(row["updatedAt"]),
            )
        }
    }

    /** Settings are a best-effort pull: a failure must not abort restoring history. */
    suspend fun fetchRemoteSettings(): SharedSettings? = try {
        val get = buildJsonObject { put("languageCode", 1); put("defaultSpeed", 1); put("historySort", 1); put("updatedAt", 1) }
        val body = lesan.callBody("user", "getMySettings", buildJsonObject {}, get, token = token())
        val obj = body as? JsonObject ?: return null
        parseSharedSettings(obj)
    } catch (_: Exception) {
        null
    }

    companion object {
        private const val PULL_PAGE_SIZE = 500
    }
}

// --- Safe JSON accessors ---
private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
private fun JsonObject.long(key: String): Long? = this[key]?.jsonPrimitive?.longOrNull
private fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull
private fun JsonObject.bool(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
private fun JsonObject.double(key: String): Double? = this[key]?.jsonPrimitive?.doubleOrNull

/** Server timestamps may be epoch millis (number) or an ISO string. */
private fun toMillis(element: JsonElement?): Long {
    val primitive = element as? JsonPrimitive ?: return System.currentTimeMillis()
    primitive.longOrNull?.let { return it }
    val content = primitive.contentOrNull ?: return System.currentTimeMillis()
    return try {
        java.time.Instant.parse(content).toEpochMilli()
    } catch (_: Exception) {
        System.currentTimeMillis()
    }
}