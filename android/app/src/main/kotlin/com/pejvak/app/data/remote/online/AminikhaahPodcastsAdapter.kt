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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

private const val BASE_URL = "https://aminikhaah.ir"
private const val PODCAST_URL = "$BASE_URL/podcast"

private const val PAGE_CONCURRENCY = 4
private const val MAX_PODCAST_PAGES = 200

private val PODCAST_HREF = Regex("/podcast/(\\d+)")
private val NUMERIC_ID = Regex("^\\d+$")
private val PAGE_NUMBER = Regex("[?&]page=(\\d+)")
private val CARD_SUBTITLE_TAG = "p"
private val CARD_SUBTITLE_CLASS = "am-song-card-text"
private val HTML_TOKEN = Regex(
    "<!--.*?-->|<\\/?[a-zA-Z](?:\"[^\"]*\"|'[^']*'|[^>\"'])*>",
    RegexOption.DOT_MATCHES_ALL,
)
private val HTML_TAG_NAME = Regex("^<\\s*([a-zA-Z0-9:-]+)")
private val HTML_CLOSE_NAME = Regex("^</\\s*([a-zA-Z0-9:-]+)")
private val VOID_TAGS = setOf(
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
)

val aminikhaahPodcastsSource: OnlineSource = OnlineSource(
    id = "aminikhaah-podcasts",
    kind = OnlineSourceKind.AminikhaahPodcasts,
    name = "Aminikhaah Podcasts",
    nativeName = "پادکست‌های امینی خواه",
    languageCode = "fa",
    homepage = PODCAST_URL,
    description = "Persian روضه podcast episodes, streamed from aminikhaah.ir.",
    attribution = "Podcasts by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
)

fun createAminikhaahPodcastsAdapter(transport: OnlineTransport): OnlineAdapter =
    AminikhaahPodcastsAdapter(transport)

private class PodcastCard(
    val id: String,
    var title: String?,
    var subtitle: String?,
    var artworkUrl: String?,
)

private data class ApiPodcastCategory(val name: String?, val imageUrl: String?)

private data class ApiPodcastSong(
    val id: Int,
    val title: String?,
    val filePath: String?,
    val duration: String?,
    val contentType: String?,
    val isVisible: Boolean?,
    val deletedAt: String?,
    val image: String?,
    val category: ApiPodcastCategory?,
)

private class HtmlElement(
    val tag: String,
    val openStart: Int,
    val openEnd: Int,
    val parent: HtmlElement?,
    val attributes: Map<String, String>,
) {
    var contentEnd: Int = -1
}

private class AminikhaahPodcastsAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = aminikhaahPodcastsSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> =
        onlineGuard {
            val firstHtml = transport.getText(PODCAST_URL)
            val firstPage = parsePodcastCards(firstHtml)
            if (firstPage.isEmpty()) throw catalogueChanged()

            val lastPage = lastPodcastPageFrom(firstHtml)
            if (lastPage > MAX_PODCAST_PAGES) throw catalogueChanged()

            val cards = firstPage.toMutableList()
            if (lastPage > 1) {
                val pages = mapWithConcurrency((2..lastPage).toList(), PAGE_CONCURRENCY) { page, _ ->
                    parsePodcastCards(transport.getText(podcastPageUrl(page)))
                }
                pages.forEach { cards.addAll(it) }
            }

            val seen = mutableSetOf<String>()
            val collections = mutableListOf<OnlineCollectionInfo>()
            for (card in cards) {
                if (seen.contains(card.id)) continue
                val collection = toCollection(card) ?: continue
                seen.add(card.id)
                collections.add(collection)
            }
            collections
        }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? {
        if (!NUMERIC_ID.matches(externalId)) return null
        return onlineGuard {
            val song = loadPodcastSong(externalId) ?: return@onlineGuard null
            val title = song.title?.takeIf { it.isNotEmpty() } ?: return@onlineGuard null
            OnlineCollectionInfo(
                key = collectionKey(source.id, externalId),
                sourceId = source.id,
                externalId = externalId,
                title = title,
                subtitle = song.category?.name,
                artworkUrl = artworkFor(song),
                trackCount = 1,
                languageCode = source.languageCode,
                pageUrl = podcastUrl(externalId),
            )
        }
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = onlineGuard {
        val externalId = externalIdFromKey(collectionKey)
        val song = fetchPodcastSong(externalId)
        val title = song.title?.takeIf { it.isNotEmpty() }
        val streamUrl = absoluteUrl(song.filePath)
        if (title == null || streamUrl == null) {
            throw OnlineSourceException(
                "That collection is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        }
        listOf(
            OnlineTrackInfo(
                externalId = song.id.toString(),
                title = title,
                artist = null,
                albumTitle = song.category?.name,
                artworkUrl = artworkFor(song),
                streamUrl = streamUrl,
                durationSec = parseAminikhaahDuration(song.duration),
                order = 1,
                pageUrl = podcastUrl(externalId),
            ),
        )
    }

    private suspend fun fetchPodcastSong(externalId: String): ApiPodcastSong {
        val body = transport.getJson("$BASE_URL/api/songs/$externalId")
        val song = parsePodcastSong(body) ?: throw unreadable()
        if (song.contentType != "podcast" || song.isVisible == false || !song.deletedAt.isNullOrEmpty()) {
            throw OnlineSourceException(
                "That collection is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        }
        return song
    }

    private suspend fun loadPodcastSong(externalId: String): ApiPodcastSong? =
        try {
            fetchPodcastSong(externalId)
        } catch (error: OnlineTransportException) {
            if (error.code == OnlineErrorCode.NotFound) null else throw error
        } catch (error: OnlineSourceException) {
            if (error.code == OnlineErrorCode.NotFound) null else throw error
        }
}

private fun parsePodcastCards(html: String): List<PodcastCard> {
    val elements = htmlElements(html)
    val main = elements.firstOrNull { it.attributes["id"] == "main-content" }
    val scoped = if (main == null) {
        elements
    } else {
        elements.filter { it.openStart >= main.openEnd && it.openStart < main.contentEnd }
    }

    val byId = linkedMapOf<String, PodcastCard>()
    for (element in scoped) {
        if (element.tag != "a") continue
        val href = element.attributes["href"] ?: continue
        if (!href.contains("/podcast/")) continue
        val id = PODCAST_HREF.find(href)?.groups?.get(1)?.value ?: continue
        val inner = html.substring(
            element.openEnd,
            element.contentEnd.coerceAtLeast(element.openEnd),
        )
        val imageTag = htmlElementTag(inner, "img")
        val heading = htmlElementInner(inner, "h5")
            ?.let(::cleanOnlineText)
            ?.takeIf { it.isNotEmpty() }
        val title = heading ?: imageTag?.let { htmlAttribute(it, "alt") }
            ?.let(::cleanOnlineText)
            ?.takeIf { it.isNotEmpty() }
        val artworkUrl = absoluteUrl(imageTag?.let { htmlAttribute(it, "src") })
        val subtitle = subtitleFor(html, element)

        val existing = byId[id]
        if (existing == null) {
            byId[id] = PodcastCard(id, title, subtitle, artworkUrl)
        } else {
            if (existing.title == null && title != null) existing.title = title
            if (existing.subtitle == null && subtitle != null) existing.subtitle = subtitle
            if (existing.artworkUrl == null && artworkUrl != null) existing.artworkUrl = artworkUrl
        }
    }
    return byId.values.toList()
}

private fun subtitleFor(html: String, anchor: HtmlElement): String? {
    val parent = anchor.parent
    if (parent != null) {
        classText(html, parent.openEnd, parent.contentEnd)?.let { return it }
    }
    return classText(html, anchor.openEnd, anchor.contentEnd)
}

private fun classText(html: String, start: Int, end: Int): String? {
    if (start < 0 || end <= start) return null
    val scope = html.substring(start, end.coerceAtMost(html.length))
    val opener = Regex(
        "<$CARD_SUBTITLE_TAG\\b(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>",
        RegexOption.IGNORE_CASE,
    )
    for (match in opener.findAll(scope)) {
        val classes = htmlAttributes(match.value)["class"]
            ?.split(Regex("\\s+"))
            ?.filter { it.isNotEmpty() }
        if (classes?.contains(CARD_SUBTITLE_CLASS) != true) continue
        val close = Regex("</$CARD_SUBTITLE_TAG\\s*>", RegexOption.IGNORE_CASE)
            .find(scope, match.range.last + 1) ?: continue
        return cleanOnlineText(scope.substring(match.range.last + 1, close.range.first))
            .takeIf { it.isNotEmpty() }
    }
    return null
}

private fun lastPodcastPageFrom(html: String): Int {
    var last = 1
    for (element in htmlElements(html)) {
        if (element.tag != "a") continue
        val href = element.attributes["href"] ?: continue
        if (!href.contains("/podcast?page=")) continue
        val page = PAGE_NUMBER.find(href)?.groups?.get(1)?.value?.toIntOrNull() ?: continue
        if (page > last) last = page
    }
    return last
}

private fun htmlElements(html: String): List<HtmlElement> {
    val elements = mutableListOf<HtmlElement>()
    val stack = ArrayDeque<HtmlElement>()

    for (match in HTML_TOKEN.findAll(html)) {
        val token = match.value
        if (token.startsWith("<!--")) continue
        if (token.startsWith("</")) {
            val name = HTML_CLOSE_NAME.find(token)?.groups?.get(1)?.value?.lowercase() ?: continue
            val index = stack.indexOfLast { it.tag == name }
            if (index >= 0) {
                while (stack.size > index) {
                    stack.removeLast().contentEnd = match.range.first
                }
            }
            continue
        }

        val name = HTML_TAG_NAME.find(token)?.groups?.get(1)?.value?.lowercase() ?: continue
        val element = HtmlElement(
            tag = name,
            openStart = match.range.first,
            openEnd = match.range.last + 1,
            parent = stack.lastOrNull(),
            attributes = htmlAttributes(token),
        )
        elements.add(element)
        if (name !in VOID_TAGS && !token.trimEnd().endsWith("/>")) {
            stack.addLast(element)
        }
    }

    while (stack.isNotEmpty()) {
        stack.removeLast().contentEnd = html.length
    }
    return elements
}

private fun parsePodcastSong(element: JsonElement): ApiPodcastSong? {
    val song = element as? JsonObject ?: return null
    val id = song["id"].jsonInt() ?: return null
    val categoryElement = song["category"]
    val category = when (categoryElement) {
        null, JsonNull -> null
        is JsonObject -> ApiPodcastCategory(
            name = categoryElement["name"].cleanJsonText(),
            imageUrl = categoryElement["image_url"].jsonString(),
        )
        else -> null
    }
    return ApiPodcastSong(
        id = id,
        title = song["title"].cleanJsonText(),
        filePath = song["file_path"].jsonString(),
        duration = song["duration"].jsonString(),
        contentType = song["content_type"].jsonString(),
        isVisible = song["is_visible"].jsonBoolean(),
        deletedAt = song["deleted_at"].jsonString(),
        image = song["image"].jsonString(),
        category = category,
    )
}

private fun artworkFor(song: ApiPodcastSong): String? =
    absoluteUrl(song.category?.imageUrl) ?: absoluteUrl(song.image)

private fun toCollection(card: PodcastCard): OnlineCollectionInfo? {
    val title = card.title ?: return null
    return OnlineCollectionInfo(
        key = collectionKey(aminikhaahPodcastsSource.id, card.id),
        sourceId = aminikhaahPodcastsSource.id,
        externalId = card.id,
        title = title,
        subtitle = card.subtitle,
        artworkUrl = card.artworkUrl,
        trackCount = 1,
        languageCode = aminikhaahPodcastsSource.languageCode,
        pageUrl = podcastUrl(card.id),
    )
}

private fun podcastPageUrl(page: Int): String = "$PODCAST_URL?page=$page"

private fun podcastUrl(externalId: String): String = "$PODCAST_URL/$externalId"

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != aminikhaahPodcastsSource.id) {
        invalidCollection()
    }
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
