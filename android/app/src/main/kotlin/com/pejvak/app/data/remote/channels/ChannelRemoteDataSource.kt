package com.pejvak.app.data.remote.channels

import com.pejvak.app.data.remote.LesanClient
import com.pejvak.app.data.remote.online.jsonInt
import com.pejvak.app.data.remote.online.jsonString
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelDraft
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.ChannelSocial
import com.pejvak.app.domain.channel.ChannelStatus
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.PlaylistDraft
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * Public reads of the Listener Channels surface (plan 07 CHAN-D02, prompt D9/D11).
 *
 * Every call is a tokenless `POST /lesan` `{ model, act, details:{set,get} }` through
 * the shared [LesanClient]; the `{success, body}` envelope is authoritative and a
 * refusal arrives as `success:false` (HTTP 501), which `callBody` raises as a
 * [com.pejvak.app.data.remote.LesanException] for the caller to turn into a notice.
 *
 * The response shapes are pinned by `back/http/channels.hurl` against the live server:
 * list acts return `{ rows, total, page, limit }`; `getChannel` returns the channel
 * row with `playlists` and a bounded `audios` slice merged in; `getChannelAudio`
 * returns the row directly. `_id` is the server id. The folder/audio rows are pure
 * projections (no relation ids), so the caller supplies the channel id they were
 * scoped by.
 */
@Singleton
class ChannelRemoteDataSource @Inject constructor(
    private val lesan: LesanClient,
) {
    data class ChannelPage(
        val rows: List<Channel>,
        val total: Int,
        val page: Int,
        val limit: Int,
    )

    data class ChannelDetail(
        val channel: Channel,
        val playlists: List<ChannelPlaylist>,
        val audios: List<ChannelAudio>,
    )

    data class AudioPage(
        val rows: List<ChannelAudio>,
        val total: Int,
        val page: Int,
        val limit: Int,
    )

    data class PlaylistPage(
        val rows: List<ChannelPlaylist>,
        val total: Int,
        val page: Int,
        val limit: Int,
    )

    /** The public directory: active channels, optionally narrowed by [category] and a [q] search. */
    suspend fun listChannels(
        category: String? = null,
        q: String? = null,
        page: Int = 1,
        limit: Int = DEFAULT_LIMIT,
        sort: String = "new",
    ): ChannelPage {
        val set = buildJsonObject {
            putInt("page", page)
            putInt("limit", limit)
            putString("sort", sort)
            if (!category.isNullOrBlank()) putString("category", category)
            if (!q.isNullOrBlank()) putString("q", q)
        }
        val body = lesan.callBody("channel", "listChannels", set, channelProjection)
        val obj = body.jsonObject
        return ChannelPage(
            rows = obj.arrayOf("rows").map { parseChannel(it.jsonObject) },
            total = obj["total"].jsonInt() ?: 0,
            page = obj["page"].jsonInt() ?: page,
            limit = obj["limit"].jsonInt() ?: limit,
        )
    }

    /** One channel page by [slug] or [channelId], with its folders and a newest-audio slice. */
    suspend fun getChannel(
        slug: String? = null,
        channelId: String? = null,
        audioLimit: Int = 20,
    ): ChannelDetail {
        val set = buildJsonObject {
            if (!channelId.isNullOrBlank()) putString("channelId", channelId)
            if (!slug.isNullOrBlank()) putString("slug", slug)
            putInt("audioLimit", audioLimit)
        }
        val body = lesan.callBody("channel", "getChannel", set, channelProjection)
        val obj = body.jsonObject
        val channel = parseChannel(obj)
        val playlists = obj.arrayOf("playlists").map { parsePlaylist(it.jsonObject, channel.serverId) }
        val audios = obj.arrayOf("audios").map { parseAudio(it.jsonObject, channel.serverId, null) }
        return ChannelDetail(channel, playlists, audios)
    }

    /** Folders of one channel, in their manual order. */
    suspend fun listChannelPlaylists(
        channelId: String,
        page: Int = 1,
        limit: Int = DEFAULT_LIMIT,
    ): PlaylistPage {
        val set = buildJsonObject {
            putString("channelId", channelId)
            putInt("page", page)
            putInt("limit", limit)
        }
        val body = lesan.callBody("channelPlaylist", "listChannelPlaylists", set, playlistProjection)
        val obj = body.jsonObject
        return PlaylistPage(
            rows = obj.arrayOf("rows").map { parsePlaylist(it.jsonObject, channelId) },
            total = obj["total"].jsonInt() ?: 0,
            page = obj["page"].jsonInt() ?: page,
            limit = obj["limit"].jsonInt() ?: limit,
        )
    }

    /** Episodes scoped to a channel and/or a folder, narrowed by [category]/[tag]/[q]. */
    suspend fun listChannelAudios(
        channelId: String? = null,
        playlistId: String? = null,
        category: String? = null,
        tag: String? = null,
        q: String? = null,
        page: Int = 1,
        limit: Int = DEFAULT_LIMIT,
    ): AudioPage {
        val set = buildJsonObject {
            if (!channelId.isNullOrBlank()) putString("channelId", channelId)
            if (!playlistId.isNullOrBlank()) putString("playlistId", playlistId)
            if (!category.isNullOrBlank()) putString("category", category)
            if (!tag.isNullOrBlank()) putString("tag", tag)
            if (!q.isNullOrBlank()) putString("q", q)
            putInt("page", page)
            putInt("limit", limit)
        }
        val body = lesan.callBody("channelAudio", "listChannelAudios", set, audioProjection)
        val obj = body.jsonObject
        return AudioPage(
            rows = obj.arrayOf("rows").map { parseAudio(it.jsonObject, channelId, playlistId) },
            total = obj["total"].jsonInt() ?: 0,
            page = obj["page"].jsonInt() ?: page,
            limit = obj["limit"].jsonInt() ?: limit,
        )
    }

    /** One episode by [audioId] or [contentHash]; the row is returned directly (no envelope). */
    suspend fun getChannelAudio(
        audioId: String? = null,
        contentHash: String? = null,
    ): ChannelAudio {
        val set = buildJsonObject {
            if (!audioId.isNullOrBlank()) putString("audioId", audioId)
            if (!contentHash.isNullOrBlank()) putString("contentHash", contentHash)
        }
        val body = lesan.callBody("channelAudio", "getChannelAudio", set, audioProjection)
        return parseAudio(body.jsonObject, null, null)
    }

    // --- Creator writes (plan 07 A3). All need a session token; a refusal is a 501
    //     `success:false` the caller surfaces as a non-blocking notice (prompt D6/D9). ---

    suspend fun createChannel(token: String, draft: ChannelDraft): Channel {
        val body = lesan.callBody("channel", "createChannel", channelSet(draft), channelProjection, token = token)
        return parseChannel(body.jsonObject)
    }

    suspend fun updateChannel(token: String, channelId: String, draft: ChannelDraft): Channel {
        val set = buildJsonObject {
            putString("channelId", channelId)
            draftSetInto(this, draft)
        }
        val body = lesan.callBody("channel", "updateChannel", set, channelProjection, token = token)
        return parseChannel(body.jsonObject)
    }

    suspend fun deleteChannel(token: String, channelId: String) {
        val set = buildJsonObject { putString("channelId", channelId) }
        val get = buildJsonObject { put("success", JsonPrimitive(1)) }
        lesan.callBody("channel", "deleteChannel", set, get, token = token)
    }

    /** The caller's own channels — a bare array, including any taken down (creator sees them). */
    suspend fun getMyChannels(token: String, limit: Int = 100): List<Channel> {
        val set = buildJsonObject { putInt("limit", limit) }
        val body = lesan.callBody("channel", "getMyChannels", set, channelProjection, token = token)
        val array = body as? JsonArray ?: return emptyList()
        return array.map { parseChannel(it.jsonObject) }
    }

    suspend fun createPlaylist(token: String, channelId: String, draft: PlaylistDraft): ChannelPlaylist {
        val set = buildJsonObject {
            putString("channelId", channelId)
            putString("title", draft.title.trim())
            putString("category", draft.category.trim())
            if (draft.description.isNotBlank()) putString("description", draft.description.trim())
            if (draft.tags.isNotEmpty()) putJsonArray("tags") { draft.tags.forEach { add(it) } }
            draft.sortOrder?.let { putInt("sortOrder", it) }
        }
        val body = lesan.callBody("channelPlaylist", "createChannelPlaylist", set, playlistProjection, token = token)
        return parsePlaylist(body.jsonObject, channelId)
    }

    suspend fun updatePlaylist(token: String, playlistId: String, channelId: String, draft: PlaylistDraft): ChannelPlaylist {
        val set = buildJsonObject {
            putString("playlistId", playlistId)
            if (draft.title.isNotBlank()) putString("title", draft.title.trim())
            if (draft.category.isNotBlank()) putString("category", draft.category.trim())
            if (draft.description.isNotBlank()) putString("description", draft.description.trim())
            if (draft.tags.isNotEmpty()) putJsonArray("tags") { draft.tags.forEach { add(it) } }
            draft.sortOrder?.let { putInt("sortOrder", it) }
        }
        val body = lesan.callBody("channelPlaylist", "updateChannelPlaylist", set, playlistProjection, token = token)
        return parsePlaylist(body.jsonObject, channelId)
    }

    suspend fun deletePlaylist(token: String, playlistId: String) {
        val set = buildJsonObject { putString("playlistId", playlistId) }
        val get = buildJsonObject { put("success", JsonPrimitive(1)) }
        lesan.callBody("channelPlaylist", "deleteChannelPlaylist", set, get, token = token)
    }

    /** Publishes an already-uploaded episode (the upload client returns the durable URL). */
    suspend fun publishAudio(
        token: String,
        playlistId: String,
        contentHash: String,
        audioUrl: String,
        mediaPath: String?,
        mimeType: String?,
        fileSizeBytes: Long,
        durationSec: Int,
        draft: EpisodeDraft,
    ): ChannelAudio {
        val set = buildJsonObject {
            putString("playlistId", playlistId)
            putString("contentHash", contentHash)
            putString("title", draft.title.trim())
            putString("category", draft.category.trim())
            putString("audioUrl", audioUrl)
            if (!mediaPath.isNullOrBlank()) putString("mediaPath", mediaPath)
            if (draft.description.isNotBlank()) putString("description", draft.description.trim())
            if (draft.tags.isNotEmpty()) putJsonArray("tags") { draft.tags.forEach { add(it) } }
            if (durationSec > 0) putInt("durationSec", durationSec)
            if (fileSizeBytes > 0) put("fileSizeBytes", JsonPrimitive(fileSizeBytes))
            if (!mimeType.isNullOrBlank()) putString("mimeType", mimeType)
            put("isAudiobook", JsonPrimitive(draft.isAudiobook))
            if (draft.author.isNotBlank()) putString("author", draft.author.trim())
            if (draft.narrator.isNotBlank()) putString("narrator", draft.narrator.trim())
            if (!draft.artworkUrl.isNullOrBlank()) putString("artworkUrl", draft.artworkUrl)
            draft.position?.let { putInt("position", it) }
            if (!draft.languageCode.isNullOrBlank()) putString("languageCode", draft.languageCode)
        }
        val body = lesan.callBody("channelAudio", "publishChannelAudio", set, audioProjection, token = token)
        return parseAudio(body.jsonObject, null, playlistId)
    }

    suspend fun updateAudio(token: String, audioId: String, channelId: String, draft: EpisodeDraft): ChannelAudio {
        val set = buildJsonObject {
            putString("audioId", audioId)
            if (draft.title.isNotBlank()) putString("title", draft.title.trim())
            if (draft.category.isNotBlank()) putString("category", draft.category.trim())
            if (draft.tags.isNotEmpty()) putJsonArray("tags") { draft.tags.forEach { add(it) } }
            if (draft.description.isNotBlank()) putString("description", draft.description.trim())
            if (draft.author.isNotBlank()) putString("author", draft.author.trim())
            if (draft.narrator.isNotBlank()) putString("narrator", draft.narrator.trim())
            if (!draft.artworkUrl.isNullOrBlank()) putString("artworkUrl", draft.artworkUrl)
            put("isAudiobook", JsonPrimitive(draft.isAudiobook))
            draft.position?.let { putInt("position", it) }
            if (!draft.languageCode.isNullOrBlank()) putString("languageCode", draft.languageCode)
        }
        val body = lesan.callBody("channelAudio", "updateChannelAudio", set, audioProjection, token = token)
        return parseAudio(body.jsonObject, channelId, null)
    }

    suspend fun moveAudio(token: String, audioId: String, targetPlaylistId: String, position: Int?) {
        val set = buildJsonObject {
            putString("audioId", audioId)
            putString("targetPlaylistId", targetPlaylistId)
            position?.let { putInt("position", it) }
        }
        lesan.callBody("channelAudio", "moveChannelAudio", set, audioProjection, token = token)
    }

    suspend fun deleteAudio(token: String, audioId: String) {
        val set = buildJsonObject { putString("audioId", audioId) }
        val get = buildJsonObject { put("success", JsonPrimitive(1)) }
        lesan.callBody("channelAudio", "deleteChannelAudio", set, get, token = token)
    }

    private fun channelSet(draft: ChannelDraft): JsonObject = buildJsonObject { draftSetInto(this, draft) }

    private fun draftSetInto(builder: kotlinx.serialization.json.JsonObjectBuilder, draft: ChannelDraft) = with(builder) {
        put("name", JsonPrimitive(draft.name.trim()))
        if (draft.bio.isNotBlank()) put("bio", JsonPrimitive(draft.bio.trim()))
        putJsonArray("categories") { draft.categories.forEach { add(it) } }
        if (!draft.languageCode.isNullOrBlank()) put("languageCode", JsonPrimitive(draft.languageCode))
        if (!draft.avatarUrl.isNullOrBlank()) put("avatarUrl", JsonPrimitive(draft.avatarUrl))
        putJsonArray("gallery") { draft.gallery.forEach { add(it) } }
        if (draft.donationUrl.isNotBlank()) put("donationUrl", JsonPrimitive(draft.donationUrl.trim()))
        if (draft.websiteUrl.isNotBlank()) put("websiteUrl", JsonPrimitive(draft.websiteUrl.trim()))
        putJsonArray("socials") {
            draft.socials.filter { it.url.isNotBlank() }.forEach { s ->
                add(buildJsonObject { put("platform", JsonPrimitive(s.platform)); put("url", JsonPrimitive(s.url)) })
            }
        }
        if (draft.contactEmail.isNotBlank()) put("contactEmail", JsonPrimitive(draft.contactEmail.trim()))
    }

    private fun parseChannel(obj: JsonObject): Channel {
        val user = obj["user"] as? JsonObject
        return Channel(
            serverId = obj.string("_id") ?: error("channel without _id"),
            slug = obj.string("slug") ?: "",
            name = obj.string("name") ?: "",
            bio = obj.string("bio"),
            categories = obj.stringList("categories"),
            languageCode = obj.string("languageCode"),
            avatarUrl = obj.string("avatarUrl"),
            gallery = obj.stringList("gallery"),
            donationUrl = obj.string("donationUrl"),
            websiteUrl = obj.string("websiteUrl"),
            socials = obj.socialList("socials"),
            contactEmail = obj.string("contactEmail"),
            status = ChannelStatus.from(obj.string("status")),
            audioCount = obj["audioCount"].jsonInt() ?: 0,
            playlistCount = obj["playlistCount"].jsonInt() ?: 0,
            creatorId = user?.string("_id"),
            creatorUsername = user?.string("username"),
            creatorDisplayName = user?.string("displayName"),
            creatorAvatarUrl = user?.string("avatarUrl"),
            isMine = false,
            cachedAt = 0L,
            createdAt = obj.long("createdAt"),
            updatedAt = obj.long("updatedAt"),
        )
    }

    private fun parsePlaylist(obj: JsonObject, channelServerId: String): ChannelPlaylist = ChannelPlaylist(
        serverId = obj.string("_id") ?: error("playlist without _id"),
        channelServerId = channelServerId,
        title = obj.string("title") ?: "",
        description = obj.string("description"),
        category = obj.string("category"),
        tags = obj.stringList("tags"),
        sortOrder = obj["sortOrder"].jsonInt() ?: 0,
        audioCount = obj["audioCount"].jsonInt() ?: 0,
        isMine = false,
        cachedAt = 0L,
    )

    private fun parseAudio(obj: JsonObject, channelServerId: String?, playlistServerId: String?): ChannelAudio = ChannelAudio(
        serverId = obj.string("_id") ?: error("audio without _id"),
        channelServerId = channelServerId ?: "",
        playlistServerId = playlistServerId,
        contentHash = obj.string("contentHash") ?: "",
        title = obj.string("title") ?: "",
        description = obj.string("description"),
        category = obj.string("category"),
        tags = obj.stringList("tags"),
        audioUrl = obj.string("audioUrl") ?: "",
        durationSec = obj["durationSec"].jsonInt() ?: 0,
        fileSizeBytes = obj.long("fileSizeBytes") ?: 0L,
        mimeType = obj.string("mimeType"),
        isAudiobook = obj["isAudiobook"].asBoolean() ?: false,
        author = obj.string("author"),
        narrator = obj.string("narrator"),
        artworkUrl = obj.string("artworkUrl"),
        position = obj["position"].jsonInt() ?: 0,
        languageCode = obj.string("languageCode"),
        status = ChannelStatus.from(obj.string("status")),
        cachedAt = 0L,
        isMine = false,
    )

    private companion object {
        const val DEFAULT_LIMIT = 50

        // Flat camelCase projections — the shape `channels.hurl` proved the server accepts.
        val channelProjection: JsonObject = projection(
            "_id", "slug", "name", "bio", "categories", "languageCode", "avatarUrl", "gallery",
            "donationUrl", "websiteUrl", "socials", "contactEmail", "status", "audioCount",
            "playlistCount", "createdAt", "updatedAt",
        ) + nested("user", "_id", "username", "displayName", "avatarUrl")

        val playlistProjection: JsonObject = projection(
            "_id", "title", "description", "category", "tags", "sortOrder", "audioCount", "createdAt", "updatedAt",
        )

        val audioProjection: JsonObject = projection(
            "_id", "contentHash", "title", "description", "category", "tags", "audioUrl", "durationSec",
            "fileSizeBytes", "mimeType", "isAudiobook", "author", "narrator", "artworkUrl", "position",
            "languageCode", "status", "createdAt", "updatedAt",
        )
    }
}

// --- minimal JSON accessors over the Lesan projection (camelCase scalar fields) ---

private fun JsonObject.string(key: String): String? = this[key].jsonString()

private fun JsonObject.long(key: String): Long? {
    val element = this[key]
    val primitive = element as? JsonPrimitive ?: return null
    if (primitive.isString) return null
    return primitive.content.trim().toDoubleOrNull()?.toLong()
}

private fun JsonElement?.asBoolean(): Boolean? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive.isString) return primitive.content.toBooleanStrictOrNull()
    return primitive.content.toBooleanStrictOrNull()
}

private fun JsonObject.stringList(key: String): List<String> {
    val array = this[key] as? JsonArray ?: return emptyList()
    return array.mapNotNull { it.jsonString() }
}

private fun JsonObject.socialList(key: String): List<ChannelSocial> {
    val array = this[key] as? JsonArray ?: return emptyList()
    return array.mapNotNull { element ->
        val obj = element as? JsonObject ?: return@mapNotNull null
        val platform = obj.string("platform") ?: return@mapNotNull null
        val url = obj.string("url") ?: return@mapNotNull null
        ChannelSocial(platform, url)
    }
}

private fun JsonObject.arrayOf(key: String): List<JsonElement> = (this[key] as? JsonArray)?.toList() ?: emptyList()

private fun kotlinx.serialization.json.JsonObjectBuilder.putString(key: String, value: String) {
    put(key, JsonPrimitive(value))
}

private fun kotlinx.serialization.json.JsonObjectBuilder.putInt(key: String, value: Int) {
    put(key, JsonPrimitive(value))
}

private fun projection(vararg fields: String): JsonObject = buildJsonObject {
    fields.forEach { put(it, JsonPrimitive(1)) }
}

private operator fun JsonObject.plus(other: JsonObject): JsonObject {
    val merged = LinkedHashMap<String, JsonElement>(this)
    merged.putAll(other)
    return JsonObject(merged)
}

private fun nested(key: String, vararg fields: String): JsonObject = buildJsonObject {
    put(key, projection(*fields))
}
