package com.pejvak.app.data.remote.online

import com.pejvak.app.domain.online.OnlineAdapter
import com.pejvak.app.domain.online.OnlineCollectionInfo
import com.pejvak.app.domain.online.OnlineErrorCode
import com.pejvak.app.domain.online.OnlineListOptions
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.OnlineSourceException
import com.pejvak.app.domain.online.OnlineSourceKind
import com.pejvak.app.domain.online.OnlineTrackInfo
import com.pejvak.app.domain.online.collectionKey
import java.net.URLEncoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

private const val BASE_URL = "https://manahej.ir"
private const val REST_URL = "$BASE_URL/wp-json/wp/v2"
private const val RADIO_SLUG = "radio"
private const val TRACK_ORDER = "date_ASC"

val manahejSource: OnlineSource = OnlineSource(
    id = "manahej",
    kind = OnlineSourceKind.Manahej,
    name = "Manahej Radio",
    nativeName = "رادیو مناهج",
    languageCode = "fa",
    homepage = BASE_URL,
    description = "Persian podcasts, book summaries and history series.",
)

fun createManahejAdapter(transport: OnlineTransport): OnlineAdapter = ManahejAdapter(transport)

private data class WpCategory(
    val id: Int,
    val name: String?,
    val slug: String,
    val parent: Int?,
    val count: Int,
)

private class ManahejAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    private var radioCategoryId: Int? = null

    override val source: OnlineSource = manahejSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> =
        onlineGuard {
            val body = transport.getJson(
                "$REST_URL/categories?per_page=100&_fields=id,name,slug,parent,count",
            )
            val categories = (body as? JsonArray)?.mapNotNull(::parseCategory)
                ?: throw catalogueChanged()
            val parentId = radioCategoryIdFrom(categories)
            categories
                .filter { it.parent == parentId && it.count > 0 }
                .sortedWith(compareByDescending<WpCategory> { it.count }.thenBy { it.id })
                .map { category ->
                    OnlineCollectionInfo(
                        key = collectionKey(source.id, category.id.toString()),
                        sourceId = source.id,
                        externalId = category.id.toString(),
                        title = category.name ?: category.id.toString(),
                        subtitle = null,
                        artworkUrl = null,
                        trackCount = category.count,
                        languageCode = source.languageCode,
                        pageUrl = collectionPageUrl(category.slug),
                    )
                }
        }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = onlineGuard {
        val externalId = externalIdFromKey(collectionKey)
        val url = "$BASE_URL/?load=playlist.json" +
            "&category=${encodeQueryComponent(externalId)}" +
            "&posts_per_pages=-1&single_playlist=1&srp_order=$TRACK_ORDER"
        val playlist = transport.getJson(url) as? JsonObject
        val raw = playlist?.get("tracks") as? JsonArray ?: return@onlineGuard emptyList()

        raw.mapIndexedNotNull { index, entry ->
            (entry as? JsonObject)?.let { mapTrack(it, index) }
        }.mapIndexed { index, track -> track.copy(order = index + 1) }
    }

    private fun radioCategoryIdFrom(categories: List<WpCategory>): Int {
        radioCategoryId?.let { return it }
        val radio = categories.firstOrNull { it.slug == RADIO_SLUG }
            ?: throw catalogueChanged()
        radioCategoryId = radio.id
        return radio.id
    }
}

private fun parseCategory(element: JsonElement): WpCategory? {
    val category = element as? JsonObject ?: return null
    val id = category["id"].jsonInt() ?: return null
    return WpCategory(
        id = id,
        name = category["name"].cleanJsonText(),
        slug = category["slug"].cleanJsonText() ?: "",
        parent = category["parent"].jsonInt(),
        count = category["count"].jsonInt() ?: 0,
    )
}

private fun mapTrack(track: JsonObject, index: Int): OnlineTrackInfo? {
    val streamUrl = cleanUrl(track["mp3"].jsonString()) ?: return null
    val title = track["track_title"].cleanJsonText() ?: return null
    val sourcePostId = track["sourcePostID"]
    if (sourcePostId == null || sourcePostId is JsonNull) return null
    val externalId = sourcePostId.jsonText()?.takeIf { it.isNotEmpty() } ?: return null

    return OnlineTrackInfo(
        externalId = externalId,
        title = title,
        artist = track["track_artist"].cleanJsonText(),
        albumTitle = track["album_title"].cleanJsonText(),
        artworkUrl = cleanUrl(track["poster"].jsonString()),
        streamUrl = streamUrl,
        durationSec = track["length"].roundedPositiveNumber(),
        order = index + 1,
        pageUrl = trackPageUrl(track),
    )
}

private fun trackPageUrl(track: JsonObject): String? {
    val entries = track["optional_storelist_cta"] as? JsonArray ?: return null
    for (entry in entries) {
        val cta = entry as? JsonObject ?: continue
        val css = cta["cta-class"].jsonString() ?: continue
        if (!css.contains("share")) continue
        return cleanUrl(cta["store-link"].jsonString())
    }
    return null
}

private fun cleanUrl(value: String?): String? {
    val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return encodeNonAscii(trimmed)
}

private fun encodeNonAscii(url: String): String {
    val builder = StringBuilder(url.length)
    var index = 0
    while (index < url.length) {
        val codePoint = url.codePointAt(index)
        val count = Character.charCount(codePoint)
        if (codePoint in 0x20..0x7E) {
            builder.append(url, index, index + count)
        } else {
            val chunk = url.substring(index, index + count)
            builder.append(URLEncoder.encode(chunk, "UTF-8").replace("+", "%20"))
        }
        index += count
    }
    return builder.toString()
}

private fun collectionPageUrl(slug: String): String =
    encodeNonAscii("$BASE_URL/category/$RADIO_SLUG/$slug/")

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != manahejSource.id) invalidCollection()
    val externalId = key.substring(separator + 1)
    if (externalId.isEmpty()) invalidCollection()
    return externalId
}

private fun invalidCollection(): Nothing =
    throw OnlineSourceException("That collection is not from this source.", OnlineErrorCode.NotFound)

private fun catalogueChanged(): OnlineSourceException =
    OnlineSourceException("The source's catalogue has changed shape.", OnlineErrorCode.InvalidResponse)
