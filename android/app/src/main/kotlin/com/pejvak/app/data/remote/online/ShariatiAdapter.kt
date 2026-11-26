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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private const val BASE_URL = "https://drshariati.com"
private const val CATALOGUE_URL =
    "$BASE_URL/wp-json/wp/v2/audiobooks?per_page=100&_fields=id,slug,link,title,date"
private const val COUNT_CONCURRENCY = 3

private val SLUG = Regex("^[a-z0-9][a-z0-9-]*$")
private val MP3_SRC = Regex("(?:https?:)?//[^\\s\"'<>]+\\.mp3", RegexOption.IGNORE_CASE)
private val SECURE_MEDIA = Regex("^http://dl\\.drshariati\\.com/", RegexOption.IGNORE_CASE)

internal data class BookEntry(val slug: String, val title: String)
internal data class Episode(val title: String?, val streamUrl: String)
internal data class BookPage(val title: String?, val episodes: List<Episode>)

val shariatiSource: OnlineSource = OnlineSource(
    id = "shariati",
    kind = OnlineSourceKind.Shariati,
    name = "Shariati",
    nativeName = "دکتر علی شریعتی",
    languageCode = "fa",
    homepage = BASE_URL,
    description = "Dr Ali Shariati's spoken books, read in full.",
    attribution = "Spoken books by Dr Ali Shariati, streamed from drshariati.com.",
)

fun createShariatiAdapter(transport: OnlineTransport): OnlineAdapter =
    ShariatiAdapter(transport)

internal fun secureMediaUrl(url: String): String =
    SECURE_MEDIA.replace(url, "https://dl.drshariati.com/")

internal fun parseEpisodes(html: String): List<Episode> {
    val audios = onlineHtmlElements(html, "audio")
    if (audios.isEmpty()) return emptyList()
    // One document pass, then resolve each audio's holder from that list. Parsing the
    // whole page once per audio (the old shape) made a book page O(audio x tags).
    val elements = onlineHtmlElements(html)
    val episodes = mutableListOf<Episode>()
    val seen = mutableSetOf<String>()
    for (audio in audios) {
        val url = audioStreamUrl(audio) ?: continue
        if (!seen.add(url)) continue
        val holder = elements
            .asSequence()
            .filter { it.start <= audio.start && it.end >= audio.end }
            .filterNot { it.start == audio.start && it.end == audio.end && it.tag == audio.tag }
            .minByOrNull { it.end - it.start }
        val title = holder
            ?.let { onlineHtmlElements(it.innerHtml, "p").firstOrNull() }
            ?.let { cleanOnlineText(it.innerHtml) }
            ?.takeIf { it.isNotEmpty() }
        episodes += Episode(title, url)
    }
    return episodes
}

/** Counts distinct audio episodes without building titles; used for catalogue counts. */
internal fun countAudioEpisodes(html: String): Int {
    val seen = mutableSetOf<String>()
    for (audio in onlineHtmlElements(html, "audio")) {
        audioStreamUrl(audio)?.let(seen::add)
    }
    return seen.size
}

private fun audioStreamUrl(audio: OnlineHtmlElement): String? {
    for (source in onlineHtmlTagOpenings(audio.innerHtml, "source")) {
        val src = onlineHtmlAttribute(source, "src") ?: continue
        val match = MP3_SRC.find(src) ?: continue
        return secureMediaUrl(match.value)
    }
    return null
}

internal fun parseBookTitle(html: String): String? =
    onlineHtmlElements(html, "h1")
        .firstOrNull()
        ?.let { cleanOnlineText(it.innerHtml) }
        ?.takeIf { it.isNotEmpty() }

internal fun parseCatalogue(value: JsonElement): List<BookEntry> {
    val entries = value as? JsonArray ?: throw OnlineSourceException(
        "The source's catalogue has changed shape.",
        OnlineErrorCode.InvalidResponse,
    )
    val books = mutableListOf<BookEntry>()
    val seen = mutableSetOf<String>()
    for (entry in entries) {
        val record = entry as? JsonObject ?: continue
        val slug = (record["slug"] as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
            ?: continue
        val titleField = record["title"] as? JsonObject
        val rendered = (titleField?.get("rendered") as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
        val title = cleanOnlineText(rendered)
        if (!SLUG.matches(slug) || title.isEmpty() || seen.contains(slug)) continue
        seen += slug
        books += BookEntry(slug, title)
    }
    return books
}

private class ShariatiAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = shariatiSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> = guard {
        val books = fetchCatalogue()
        val counts = mapConcurrent(books, COUNT_CONCURRENCY) { countEpisodes(it.slug) }
        books.mapIndexed { index, book ->
            toCollection(book, counts.getOrElse(index) { 0 })
        }
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = guard {
        val slug = slugFromKey(collectionKey)
        val page = fetchBook(slug)
        if (page.episodes.isEmpty()) {
            throw OnlineSourceException(
                "That collection is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        }
        val albumTitle = page.title
        page.episodes.mapIndexed { index, episode ->
            OnlineTrackInfo(
                externalId = "$slug#${index + 1}",
                title = episode.title ?: "قسمت ${index + 1}",
                artist = null,
                albumTitle = albumTitle,
                artworkUrl = null,
                streamUrl = episode.streamUrl,
                durationSec = 0,
                order = index + 1,
                pageUrl = bookUrl(slug),
            )
        }
    }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? = guard {
        if (!SLUG.matches(externalId)) return@guard null
        val page = try {
            fetchBook(externalId)
        } catch (error: OnlineTransportException) {
            if (error.code == OnlineErrorCode.NotFound) return@guard null
            throw error
        }
        val title = page.title ?: return@guard null
        if (page.episodes.isEmpty()) return@guard null
        OnlineCollectionInfo(
            key = collectionKey(shariatiSource.id, externalId),
            sourceId = shariatiSource.id,
            externalId = externalId,
            title = title,
            subtitle = null,
            artworkUrl = null,
            trackCount = page.episodes.size,
            languageCode = shariatiSource.languageCode,
            pageUrl = bookUrl(externalId),
        )
    }

    private suspend fun fetchCatalogue(): List<BookEntry> {
        val books = parseCatalogue(transport.getJson(CATALOGUE_URL))
        if (books.isEmpty()) {
            throw OnlineSourceException(
                "The source has no spoken books to offer.",
                OnlineErrorCode.InvalidResponse,
            )
        }
        return books
    }

    private suspend fun fetchBook(slug: String): BookPage {
        val html = transport.getText(bookUrl(slug))
        return BookPage(parseBookTitle(html), parseEpisodes(html))
    }

    private suspend fun countEpisodes(slug: String): Int =
        try {
            countAudioEpisodes(transport.getText(bookUrl(slug)))
        } catch (_: OnlineTransportException) {
            0
        }
}

private fun bookUrl(slug: String): String = "$BASE_URL/audiobooks/$slug/"

private fun toCollection(entry: BookEntry, trackCount: Int): OnlineCollectionInfo =
    OnlineCollectionInfo(
        key = collectionKey(shariatiSource.id, entry.slug),
        sourceId = shariatiSource.id,
        externalId = entry.slug,
        title = entry.title,
        subtitle = null,
        artworkUrl = null,
        trackCount = trackCount,
        languageCode = shariatiSource.languageCode,
        pageUrl = bookUrl(entry.slug),
    )

private fun slugFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != shariatiSource.id) {
        throw OnlineSourceException(
            "That collection is not from this source.",
            OnlineErrorCode.NotFound,
        )
    }
    val slug = key.substring(separator + 1)
    if (!SLUG.matches(slug)) {
        throw OnlineSourceException(
            "That collection is not from this source.",
            OnlineErrorCode.NotFound,
        )
    }
    return slug
}

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
