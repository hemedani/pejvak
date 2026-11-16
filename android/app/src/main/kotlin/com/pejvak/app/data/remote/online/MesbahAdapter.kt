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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

private const val BASE_URL = "https://mesbahyazdi.ir"
private const val SPOKEN_URL = "$BASE_URL/works/spoken"
private const val PAGE_CONCURRENCY = 4
private const val MAX_PAGES = 60

private val NODE_HREF = Regex("/node/(\\d+)")
private val NUMERIC_ID = Regex("^\\d+$")
private val MP3_SRC = Regex("(?:https?:)?//[^\\s\"'<>]+\\.mp3", RegexOption.IGNORE_CASE)
private val PAGE_HREF = Regex("[?&]page=(\\d+)")

internal data class SpokenCard(
    val id: String,
    val title: String?,
    val subtitle: String?,
    val series: String?,
    val hasAudio: Boolean,
)

internal data class SpokenWork(
    val id: String,
    val title: String?,
    val streamUrl: String?,
)

val mesbahSource: OnlineSource = OnlineSource(
    id = "mesbah",
    kind = OnlineSourceKind.Mesbah,
    name = "Mesbah Yazdi",
    nativeName = "پایگاه آثار علامه مصباح یزدی",
    languageCode = "fa",
    homepage = BASE_URL,
    description = "Ayatollah Mesbah Yazdi's lectures, lessons and interviews.",
    attribution = "Lectures by Ayatollah Mesbah Yazdi, streamed from mesbahyazdi.ir.",
)

fun createMesbahAdapter(transport: OnlineTransport): OnlineAdapter = MesbahAdapter(transport)

internal fun parseSpokenCards(html: String): List<SpokenCard> {
    val cards = mutableListOf<SpokenCard>()
    for (item in onlineHtmlElements(html, className = "dexp-grid-item")) {
        val titleBlock = onlineHtmlElements(item.innerHtml, className = "sp-t").firstOrNull()
        val anchor = titleBlock?.let { onlineHtmlElements(it.innerHtml, "a").firstOrNull() }
        val id = anchor?.let { onlineHtmlAttribute(it.attributes, "href") }
            ?.let { NODE_HREF.find(it)?.groupValues?.get(1) }
            ?: continue

        val subtitleField = onlineHtmlElements(
            item.innerHtml,
            className = "views-field-field-subtitle-1",
        ).firstOrNull()
        val subtitleContent = subtitleField?.let {
            onlineHtmlElements(it.innerHtml, className = "field-content").firstOrNull()
        }
        val group = onlineHtmlElements(item.innerHtml, className = "sp-group").firstOrNull()
        val seriesAnchor = group?.let { onlineHtmlElements(it.innerHtml, "a").firstOrNull() }
        val address = onlineHtmlElements(item.innerHtml, className = "s-addr")
            .firstOrNull()
            ?.let { cleanOnlineText(it.innerHtml) }
            .orEmpty()

        cards += SpokenCard(
            id = id,
            title = cleanOnlineText(anchor?.innerHtml).takeIf { it.isNotEmpty() },
            subtitle = cleanOnlineText(subtitleContent?.innerHtml).takeIf { it.isNotEmpty() },
            series = cleanOnlineText(seriesAnchor?.innerHtml).takeIf { it.isNotEmpty() },
            hasAudio = MP3_SRC.containsMatchIn(address),
        )
    }
    return cards
}

internal fun lastPageFrom(html: String): Int {
    var last = 1
    for (anchor in onlineHtmlElements(html, "a")) {
        val href = onlineHtmlAttribute(anchor.attributes, "href") ?: continue
        val linked = PAGE_HREF.find(href)?.groupValues?.get(1)?.toIntOrNull() ?: continue
        val page = linked + 1
        if (page > last) last = page
    }
    return last
}

internal fun parseSpokenWork(html: String, externalId: String): SpokenWork {
    val title = onlineHtmlElements(html, "h1")
        .firstOrNull()
        ?.let { cleanOnlineText(it.innerHtml) }
        ?.takeIf { it.isNotEmpty() }
    var streamUrl: String? = null
    for (audio in onlineHtmlElements(html, "audio")) {
        for (source in onlineHtmlTagOpenings(audio.innerHtml, "source")) {
            val src = onlineHtmlAttribute(source, "src") ?: continue
            val match = MP3_SRC.find(src)
            if (match != null) {
                streamUrl = match.value
                break
            }
        }
        if (streamUrl != null) break
    }
    return SpokenWork(externalId, title, streamUrl)
}

private class MesbahAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = mesbahSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> = guard {
        val firstHtml = transport.getText(SPOKEN_URL)
        val firstPage = parseSpokenCards(firstHtml)
        if (firstPage.isEmpty()) {
            throw OnlineSourceException(
                "The source's catalogue has changed shape.",
                OnlineErrorCode.InvalidResponse,
            )
        }

        val lastPage = lastPageFrom(firstHtml)
        if (lastPage > MAX_PAGES) {
            throw OnlineSourceException(
                "The source's catalogue has changed shape.",
                OnlineErrorCode.InvalidResponse,
            )
        }

        val cards = firstPage.toMutableList()
        if (lastPage > 1) {
            val pages = mapConcurrent((2..lastPage).toList(), PAGE_CONCURRENCY) { page ->
                parseSpokenCards(transport.getText(pageUrl(page)))
            }
            pages.forEach { cards.addAll(it) }
        }

        val seen = mutableSetOf<String>()
        val collections = mutableListOf<OnlineCollectionInfo>()
        for (card in cards) {
            if (!card.hasAudio || seen.contains(card.id)) continue
            val collection = toCollection(card) ?: continue
            seen += card.id
            collections += collection
        }
        collections
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = guard {
        val externalId = externalIdFromKey(collectionKey)
        val work = loadWork(externalId) ?: throw gone()
        val title = work.title ?: throw gone()
        val streamUrl = work.streamUrl ?: throw gone()
        listOf(
            OnlineTrackInfo(
                externalId = externalId,
                title = title,
                artist = null,
                albumTitle = null,
                artworkUrl = null,
                streamUrl = streamUrl,
                durationSec = 0,
                order = 1,
                pageUrl = nodeUrl(externalId),
            ),
        )
    }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? = guard {
        if (!NUMERIC_ID.matches(externalId)) return@guard null
        val work = try {
            loadWork(externalId)
        } catch (error: OnlineTransportException) {
            if (error.code == OnlineErrorCode.NotFound) return@guard null
            throw error
        }
        val title = work?.title ?: return@guard null
        OnlineCollectionInfo(
            key = collectionKey(mesbahSource.id, externalId),
            sourceId = mesbahSource.id,
            externalId = externalId,
            title = title,
            subtitle = null,
            artworkUrl = null,
            trackCount = 1,
            languageCode = mesbahSource.languageCode,
            pageUrl = nodeUrl(externalId),
        )
    }

    private suspend fun loadWork(externalId: String): SpokenWork? {
        if (!NUMERIC_ID.matches(externalId)) return null
        return parseSpokenWork(transport.getText(nodeUrl(externalId)), externalId)
    }
}

private fun toCollection(card: SpokenCard): OnlineCollectionInfo? {
    val title = card.title ?: return null
    return OnlineCollectionInfo(
        key = collectionKey(mesbahSource.id, card.id),
        sourceId = mesbahSource.id,
        externalId = card.id,
        title = title,
        subtitle = card.series ?: card.subtitle,
        artworkUrl = null,
        trackCount = 1,
        languageCode = mesbahSource.languageCode,
        pageUrl = nodeUrl(card.id),
    )
}

private fun pageUrl(page: Int): String =
    if (page == 1) SPOKEN_URL else "$SPOKEN_URL?page=${page - 1}"

private fun nodeUrl(externalId: String): String = "$BASE_URL/node/$externalId"

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != mesbahSource.id) throw notFound()
    val externalId = key.substring(separator + 1)
    if (!NUMERIC_ID.matches(externalId)) throw notFound()
    return externalId
}

private fun notFound(): OnlineSourceException = OnlineSourceException(
    "That collection is not from this source.",
    OnlineErrorCode.NotFound,
)

private fun gone(): OnlineSourceException = OnlineSourceException(
    "That collection is no longer on the source.",
    OnlineErrorCode.NotFound,
)

private suspend fun <T> guard(block: suspend () -> T): T =
    try {
        block()
    } catch (error: OnlineTransportException) {
        throw OnlineSourceException(
            error.message ?: "The source did not answer.",
            error.code,
            error,
        )
    }

private suspend fun <T, R> mapConcurrent(
    items: List<T>,
    concurrency: Int,
    block: suspend (T) -> R,
): List<R> = coroutineScope {
    val permits = Semaphore(concurrency.coerceAtLeast(1))
    items.map { item ->
        async { permits.withPermit { block(item) } }
    }.awaitAll()
}
