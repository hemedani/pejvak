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
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

private const val BASE_URL = "https://aminikhaah.ir"
private const val SEARCH_URL = "$BASE_URL/search"

private const val PAGE_CONCURRENCY = 4
private const val MAX_CATALOG_PAGES = 200
private const val MAX_CATEGORY_LOOKUPS = 100
private const val SEARCH_ROWS = 40

private val ALBUM_HREF = Regex("/album/(\\d+)")
private val NUMERIC_ID = Regex("^\\d+$")
private val DURATION = Regex("(\\d{1,3}):([0-5]?\\d)(?::([0-5]\\d))?")
private val HTTP_URL = Regex("^https?://", RegexOption.IGNORE_CASE)
private val HTML_ATTRIBUTE = Regex(
    "([a-zA-Z_:][a-zA-Z0-9_:.-]*)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
)

val aminikhaahSource: OnlineSource = OnlineSource(
    id = "aminikhaah",
    kind = OnlineSourceKind.Aminikhaah,
    name = "Aminikhaah",
    nativeName = "پایگاه امینی خواه",
    languageCode = "fa",
    homepage = BASE_URL,
    description = "Persian lectures and book readings.",
    attribution = "Lectures by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
)

fun createAminikhaahAdapter(transport: OnlineTransport): OnlineAdapter =
    AminikhaahAdapter(transport)

private data class ApiCategory(
    val id: Int,
    val name: String?,
    val isVisible: Boolean?,
    val deletedAt: String?,
)

private data class ApiAlbum(
    val id: Int,
    val name: String?,
    val imageUrl: String?,
    val categoryId: Int?,
    val isVisible: Boolean?,
    val deletedAt: String?,
)

private data class ApiSong(
    val id: Int,
    val title: String?,
    val filePath: String?,
    val duration: String?,
    val isVisible: Boolean?,
    val deletedAt: String?,
)

private data class ApiAlbumDetail(
    val album: ApiAlbum,
    val songs: List<ApiSong>?,
)

private class AlbumSummary(
    val id: String,
    var title: String?,
    var artworkUrl: String?,
)

internal data class HtmlAnchor(val href: String?, val innerHtml: String)

private class AminikhaahAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = aminikhaahSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> =
        onlineGuard {
            coroutineScope {
                val categoriesDeferred = async { fetchCategoryNames() }
                val albumsDeferred = async { fetchAlbumPages() }
                val categories = categoriesDeferred.await()
                val albums = albumsDeferred.await()
                resolveCategoryNames(categories, albums)

                val seen = mutableSetOf<Int>()
                val collections = mutableListOf<OnlineCollectionInfo>()
                for (album in albums) {
                    if (seen.contains(album.id) || !isVisible(album.isVisible, album.deletedAt)) {
                        continue
                    }
                    val title = album.name?.takeIf { it.isNotEmpty() } ?: continue
                    seen.add(album.id)
                    collections.add(
                        OnlineCollectionInfo(
                            key = collectionKey(source.id, album.id.toString()),
                            sourceId = source.id,
                            externalId = album.id.toString(),
                            title = title,
                            subtitle = album.categoryId?.let { categories[it] },
                            artworkUrl = absoluteUrl(album.imageUrl),
                            trackCount = 0,
                            languageCode = source.languageCode,
                            pageUrl = albumUrl(album.id.toString()),
                        ),
                    )
                }
                collections
            }
        }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? {
        if (!NUMERIC_ID.matches(externalId)) return null
        return onlineGuard {
            val detail = try {
                fetchAlbumDetail(externalId)
            } catch (error: OnlineTransportException) {
                if (error.code == OnlineErrorCode.NotFound) return@onlineGuard null
                throw error
            } catch (error: OnlineSourceException) {
                if (error.code == OnlineErrorCode.NotFound) return@onlineGuard null
                throw error
            }
            val title = detail.album.name?.takeIf { it.isNotEmpty() }
                ?: return@onlineGuard null

            OnlineCollectionInfo(
                key = collectionKey(source.id, externalId),
                sourceId = source.id,
                externalId = externalId,
                title = title,
                subtitle = categoryNameFor(detail.album.categoryId),
                artworkUrl = absoluteUrl(detail.album.imageUrl),
                trackCount = playableSongs(detail).size,
                languageCode = source.languageCode,
                pageUrl = albumUrl(externalId),
            )
        }
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = onlineGuard {
        val externalId = externalIdFromKey(collectionKey)
        val detail = fetchAlbumDetail(externalId)
        val albumTitle = detail.album.name?.takeIf { it.isNotEmpty() }
        val artworkUrl = absoluteUrl(detail.album.imageUrl)
        val tracks = mutableListOf<OnlineTrackInfo>()

        for (song in playableSongs(detail)) {
            val title = song.title?.takeIf { it.isNotEmpty() } ?: continue
            val streamUrl = absoluteUrl(song.filePath) ?: continue
            tracks.add(
                OnlineTrackInfo(
                    externalId = song.id.toString(),
                    title = title,
                    artist = null,
                    albumTitle = albumTitle,
                    artworkUrl = artworkUrl,
                    streamUrl = streamUrl,
                    durationSec = parseAminikhaahDuration(song.duration),
                    order = tracks.size + 1,
                    pageUrl = "$BASE_URL/song/${song.id}",
                ),
            )
        }
        tracks
    }

    override suspend fun searchCollections(
        query: String,
        options: OnlineListOptions,
    ): List<OnlineCollectionInfo> = onlineGuard {
        val text = query.trim()
        if (text.isEmpty()) return@onlineGuard emptyList()
        val html = transport.getText("$SEARCH_URL?q=${encodeQueryComponent(text)}")
        val collections = mutableListOf<OnlineCollectionInfo>()
        for (album in parseAlbumCards(html)) {
            val collection = toCollection(album) ?: continue
            collections.add(collection)
            if (collections.size >= SEARCH_ROWS) break
        }
        collections
    }

    private suspend fun fetchCategoryNames(): MutableMap<Int, String> {
        val body = transport.getJson("$BASE_URL/api/categories")
        val categories = body as? JsonArray ?: throw catalogueChanged()
        val names = mutableMapOf<Int, String>()
        for (element in categories) {
            val category = parseCategory(element) ?: continue
            if (!isVisible(category.isVisible, category.deletedAt)) continue
            val name = category.name ?: continue
            names[category.id] = name
        }
        return names
    }

    private suspend fun fetchAlbumPages(): List<ApiAlbum> {
        val firstBody = transport.getJson(albumPageUrl(1))
        val first = firstBody as? JsonObject ?: throw catalogueChanged()
        val firstData = first["data"] as? JsonArray ?: throw catalogueChanged()
        val lastPage = first["last_page"].jsonInt() ?: throw catalogueChanged()
        if (lastPage < 1 || lastPage > MAX_CATALOG_PAGES) throw catalogueChanged()

        val albums = mutableListOf<ApiAlbum>()
        firstData.mapNotNullTo(albums, ::parseAlbum)
        if (lastPage > 1) {
            val pages = mapWithConcurrency((2..lastPage).toList(), PAGE_CONCURRENCY) { page, _ ->
                val body = transport.getJson(albumPageUrl(page))
                val pageObject = body as? JsonObject ?: throw catalogueChanged()
                val data = pageObject["data"] as? JsonArray ?: throw catalogueChanged()
                data.mapNotNull(::parseAlbum)
            }
            pages.forEach { albums.addAll(it) }
        }
        return albums
    }

    private suspend fun resolveCategoryNames(
        categories: MutableMap<Int, String>,
        albums: List<ApiAlbum>,
    ): MutableMap<Int, String> {
        val unresolved = linkedSetOf<Int>()
        for (album in albums) {
            if (!isVisible(album.isVisible, album.deletedAt) || album.name.isNullOrEmpty()) continue
            val categoryId = album.categoryId ?: continue
            if (!categories.containsKey(categoryId)) unresolved.add(categoryId)
        }
        val ids = unresolved.take(MAX_CATEGORY_LOOKUPS)
        if (ids.isEmpty()) return categories
        val names = mapWithConcurrency(ids, PAGE_CONCURRENCY) { id, _ -> categoryNameFor(id) }
        ids.forEachIndexed { index, id ->
            names[index]?.let { categories[id] = it }
        }
        return categories
    }

    private suspend fun categoryNameFor(categoryId: Int?): String? {
        if (categoryId == null) return null
        return try {
            val body = transport.getJson("$BASE_URL/api/categories/$categoryId")
            val category = (body as? JsonObject)?.get("category") as? JsonObject
            category?.get("name").cleanJsonText()
        } catch (error: OnlineTransportException) {
            null
        }
    }

    private suspend fun fetchAlbumDetail(externalId: String): ApiAlbumDetail {
        val body = transport.getJson(albumApiUrl(externalId))
        val detail = body as? JsonObject ?: throw unreadable()
        val album = parseAlbum(detail) ?: throw unreadable()
        val songsElement = detail["songs"]
        val songs = when (songsElement) {
            null, JsonNull -> null
            is JsonArray -> songsElement.mapNotNull(::parseSong)
            else -> throw unreadable()
        }
        return ApiAlbumDetail(album, songs)
    }
}

private fun playableSongs(detail: ApiAlbumDetail): List<ApiSong> =
    detail.songs.orEmpty().filter { song ->
        isVisible(song.isVisible, song.deletedAt) &&
            !song.title.isNullOrEmpty() &&
            absoluteUrl(song.filePath) != null
    }

private fun toCollection(album: AlbumSummary): OnlineCollectionInfo? {
    val title = album.title ?: return null
    return OnlineCollectionInfo(
        key = collectionKey(aminikhaahSource.id, album.id),
        sourceId = aminikhaahSource.id,
        externalId = album.id,
        title = title,
        subtitle = null,
        artworkUrl = album.artworkUrl,
        trackCount = 0,
        languageCode = aminikhaahSource.languageCode,
        pageUrl = albumUrl(album.id),
    )
}

private fun parseCategory(element: JsonElement): ApiCategory? {
    val category = element as? JsonObject ?: return null
    val id = category["id"].jsonInt() ?: return null
    return ApiCategory(
        id = id,
        name = category["name"].cleanJsonText(),
        isVisible = category["is_visible"].jsonBoolean(),
        deletedAt = category["deleted_at"].jsonString(),
    )
}

private fun parseAlbum(element: JsonElement): ApiAlbum? {
    val album = element as? JsonObject ?: return null
    val id = album["id"].jsonInt() ?: return null
    return ApiAlbum(
        id = id,
        name = album["name"].cleanJsonText(),
        imageUrl = album["image_url"].jsonString(),
        categoryId = album["category_id"].jsonInt(),
        isVisible = album["is_visible"].jsonBoolean(),
        deletedAt = album["deleted_at"].jsonString(),
    )
}

private fun parseSong(element: JsonElement): ApiSong? {
    val song = element as? JsonObject ?: return null
    val id = song["id"].jsonInt() ?: return null
    return ApiSong(
        id = id,
        title = song["title"].cleanJsonText(),
        filePath = song["file_path"].jsonString(),
        duration = song["duration"].jsonString(),
        isVisible = song["is_visible"].jsonBoolean(),
        deletedAt = song["deleted_at"].jsonString(),
    )
}

private fun isVisible(isVisible: Boolean?, deletedAt: String?): Boolean =
    isVisible != false && deletedAt.isNullOrEmpty()

private fun albumPageUrl(page: Int): String = "$BASE_URL/api/albums?page=$page"

private fun albumApiUrl(externalId: String): String = "$BASE_URL/api/albums/$externalId"

private fun albumUrl(externalId: String): String = "$BASE_URL/album/$externalId"

internal fun absoluteUrl(value: String?): String? {
    val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return when {
        HTTP_URL.containsMatchIn(trimmed) -> trimmed
        trimmed.startsWith("//") -> "https:$trimmed"
        trimmed.startsWith("/") -> "$BASE_URL$trimmed"
        else -> "$BASE_URL/$trimmed"
    }
}

internal fun parseAminikhaahDuration(text: String?): Int {
    val match = DURATION.find(text ?: "") ?: return 0
    val first = match.groups[1]?.value?.toIntOrNull() ?: return 0
    val second = match.groups[2]?.value?.toIntOrNull() ?: return 0
    val third = match.groups[3]?.value
    val seconds = if (third.isNullOrEmpty()) {
        first * 60 + second
    } else {
        first * 3600 + second * 60 + (third.toIntOrNull() ?: return 0)
    }
    return if (seconds > 0) seconds else 0
}

internal suspend fun <T, R> mapWithConcurrency(
    items: List<T>,
    limit: Int,
    worker: suspend (T, Int) -> R,
): List<R> {
    if (items.isEmpty() || limit <= 0) return emptyList()
    val results = arrayOfNulls<Any?>(items.size)
    val next = AtomicInteger(0)
    coroutineScope {
        repeat(minOf(limit, items.size)) {
            launch {
                while (true) {
                    val index = next.getAndIncrement()
                    if (index >= items.size) break
                    results[index] = worker(items[index], index)
                }
            }
        }
    }
    @Suppress("UNCHECKED_CAST")
    return results.asList() as List<R>
}

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != aminikhaahSource.id) invalidCollection()
    val externalId = key.substring(separator + 1)
    if (!NUMERIC_ID.matches(externalId)) invalidCollection()
    return externalId
}

private fun invalidCollection(): Nothing =
    throw OnlineSourceException("That collection is not from this source.", OnlineErrorCode.NotFound)

private fun catalogueChanged(): OnlineSourceException =
    OnlineSourceException("The source's catalogue has changed shape.", OnlineErrorCode.InvalidResponse)

private fun unreadable(): OnlineSourceException =
    OnlineSourceException("The source sent something unreadable.", OnlineErrorCode.InvalidResponse)

private fun parseAlbumCards(html: String): List<AlbumSummary> {
    val byId = linkedMapOf<String, AlbumSummary>()
    for (anchor in htmlAnchors(html)) {
        val href = anchor.href ?: continue
        val id = ALBUM_HREF.find(href)?.groups?.get(1)?.value ?: continue
        val imageTag = htmlElementTag(anchor.innerHtml, "img")
        val heading = htmlElementInner(anchor.innerHtml, "h5")
            ?.let(::cleanOnlineText)
            ?.takeIf { it.isNotEmpty() }
        val title = heading ?: imageTag?.let { htmlAttribute(it, "alt") }
            ?.let(::cleanOnlineText)
            ?.takeIf { it.isNotEmpty() }
        val artworkUrl = absoluteUrl(imageTag?.let { htmlAttribute(it, "src") })

        val existing = byId[id]
        if (existing == null) {
            byId[id] = AlbumSummary(id, title, artworkUrl)
        } else {
            if (existing.title == null && title != null) existing.title = title
            if (existing.artworkUrl == null && artworkUrl != null) existing.artworkUrl = artworkUrl
        }
    }
    return byId.values.toList()
}

internal fun htmlAnchors(html: String): List<HtmlAnchor> {
    val results = mutableListOf<HtmlAnchor>()
    val opener = Regex("<a\\b(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>", RegexOption.IGNORE_CASE)
    val closer = Regex("</a\\s*>", RegexOption.IGNORE_CASE)
    var position = 0
    while (position < html.length) {
        val open = opener.find(html, position) ?: break
        val close = closer.find(html, open.range.last + 1) ?: break
        results.add(
            HtmlAnchor(
                href = htmlAttribute(open.value, "href"),
                innerHtml = html.substring(open.range.last + 1, close.range.first),
            ),
        )
        position = close.range.last + 1
    }
    return results
}

internal fun htmlAttribute(tag: String, name: String): String? {
    val pattern = Regex(
        "(?:^|\\s)${Regex.escape(name)}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
        RegexOption.IGNORE_CASE,
    )
    val match = pattern.find(tag) ?: return null
    val value = match.groups[1]?.value?.takeIf { it.isNotEmpty() }
        ?: match.groups[2]?.value?.takeIf { it.isNotEmpty() }
        ?: match.groups[3]?.value
        ?: return null
    return decodeOnlineEntities(value).trim().takeIf { it.isNotEmpty() }
}

internal fun htmlElementTag(html: String, tag: String): String? =
    Regex("<$tag\\b(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>", RegexOption.IGNORE_CASE).find(html)?.value

internal fun htmlElementInner(html: String, tag: String): String? {
    val open = Regex("<$tag\\b(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>", RegexOption.IGNORE_CASE)
        .find(html) ?: return null
    val close = Regex("</$tag\\s*>", RegexOption.IGNORE_CASE)
        .find(html, open.range.last + 1) ?: return null
    return html.substring(open.range.last + 1, close.range.first)
}

internal fun htmlAttributes(tag: String): Map<String, String> {
    val attributes = mutableMapOf<String, String>()
    for (match in HTML_ATTRIBUTE.findAll(tag)) {
        val name = match.groups[1]?.value?.lowercase() ?: continue
        val value = match.groups[2]?.value?.takeIf { it.isNotEmpty() }
            ?: match.groups[3]?.value?.takeIf { it.isNotEmpty() }
            ?: match.groups[4]?.value
            ?: continue
        attributes[name] = decodeOnlineEntities(value).trim()
    }
    return attributes
}
