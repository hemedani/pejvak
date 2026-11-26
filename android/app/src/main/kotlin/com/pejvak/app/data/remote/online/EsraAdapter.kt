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

private const val BASE_URL = "https://esra.ir"
private const val SESSION_CONCURRENCY = 4
private const val MAX_SESSIONS = 90

private val LESSON_HREF = Regex("/web/javadi/w/([A-Za-z0-9_-]+)")
private val MP3_SRC = Regex("(?:https?:)?//[^\\s\"'<>]+\\.mp3", RegexOption.IGNORE_CASE)
private val SESSION_DIGIT = Regex("[۰-۹٠-٩]")
private val SESSION_NUMBER = Regex("جلسه\\s*(\\d{1,3})")

private val DIGITS = mapOf(
    '۰' to '0', '۱' to '1', '۲' to '2', '۳' to '3', '۴' to '4',
    '۵' to '5', '۶' to '6', '۷' to '7', '۸' to '8', '۹' to '9',
    '٠' to '0', '١' to '1', '٢' to '2', '٣' to '3', '٤' to '4',
    '٥' to '5', '٦' to '6', '٧' to '7', '٨' to '8', '٩' to '9',
)

private data class Series(
    val id: String,
    val path: String,
    val label: String,
    val fallbackTitle: String,
)

private val SERIES = listOf(
    Series(
        id = "tafsir",
        path = "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%AA%D9%81%D8%B3%DB%8C%D8%B1",
        label = "دروس تفسیر",
        fallbackTitle = "تفسیر قرآن",
    ),
    Series(
        id = "fiqh",
        path = "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D9%81%D9%82%D9%87",
        label = "دروس فقه",
        fallbackTitle = "دروس فقه",
    ),
    Series(
        id = "akhlaq",
        path = "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%A7%D8%AE%D9%84%D8%A7%D9%82",
        label = "دروس اخلاق",
        fallbackTitle = "درس اخلاق",
    ),
)

internal data class LessonLink(val slug: String, val title: String)

val esraSource: OnlineSource = OnlineSource(
    id = "esra",
    kind = OnlineSourceKind.Esra,
    name = "Esra",
    nativeName = "بنیاد بین‌المللی اسراء",
    languageCode = "fa",
    homepage = BASE_URL,
    description = "Ayatollah Javadi Amoli's tafsir, fiqh and ethics lessons.",
    attribution = "Lessons by Ayatollah Javadi Amoli, streamed from esra.ir.",
)

fun createEsraAdapter(transport: OnlineTransport): OnlineAdapter = EsraAdapter(transport)

internal fun parseLessonLinks(html: String): List<LessonLink> {
    val bySlug = LinkedHashMap<String, LessonLink>()
    for (anchor in onlineHtmlElements(html, "a")) {
        val href = onlineHtmlAttribute(anchor.attributes, "href") ?: continue
        val slug = LESSON_HREF.find(href)?.groupValues?.get(1) ?: continue
        if (bySlug.containsKey(slug)) continue
        val title = cleanOnlineText(anchor.innerHtml)
        if (title.isEmpty()) continue
        bySlug[slug] = LessonLink(slug, title)
    }
    return bySlug.values.toList()
}

internal fun sessionNumber(title: String): Int? {
    val normalised = SESSION_DIGIT.replace(title) { match ->
        DIGITS[match.value.single()]?.toString() ?: match.value
    }
    val value = SESSION_NUMBER.find(normalised)?.groupValues?.get(1)?.toIntOrNull() ?: return null
    return value.takeIf { it > 0 }
}

internal fun inListeningOrder(lessons: List<LessonLink>): List<LessonLink> {
    val numbered = lessons.all { sessionNumber(it.title) != null }
    return if (numbered) {
        lessons.sortedBy { sessionNumber(it.title) ?: 0 }
    } else {
        lessons.reversed()
    }
}

internal fun seriesTitleFrom(lessons: List<LessonLink>, fallback: String): String {
    val first = lessons.firstOrNull() ?: return fallback
    val prefix = cleanOnlineText(first.title.substringBefore("جلسه"))
    return if (prefix.length >= 4) prefix else fallback
}

internal fun parseLessonAudio(html: String): String? {
    for (audio in onlineHtmlElements(html, "audio")) {
        for (source in onlineHtmlTagOpenings(audio.innerHtml, "source")) {
            val src = onlineHtmlAttribute(source, "src") ?: continue
            val match = MP3_SRC.find(src)
            if (match != null) return match.value
        }
    }
    val download = onlineHtmlTagOpenings(html, "a")
        .mapNotNull { onlineHtmlAttribute(it, "href") }
        .firstOrNull { it.contains(".mp3", ignoreCase = true) }
        ?: return null
    return MP3_SRC.find(download)?.value
}

private class EsraAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = esraSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> = guard {
        val pages = mapConcurrent(SERIES, 2) { fetchLessons(it) }
        SERIES.mapIndexed { index, series ->
            toCollection(series, pages.getOrElse(index) { emptyList() })
        }
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = guard {
        val series = seriesById(seriesIdFromKey(collectionKey))
            ?: throw OnlineSourceException(
                "That collection is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        val lessons = inListeningOrder(fetchLessons(series))
        val audios = mapConcurrent(lessons, SESSION_CONCURRENCY) { lesson ->
            try {
                parseLessonAudio(transport.getText(lessonUrl(lesson.slug)))
            } catch (_: OnlineTransportException) {
                null
            }
        }

        val albumTitle = seriesTitleFrom(lessons, series.fallbackTitle)
        val tracks = mutableListOf<OnlineTrackInfo>()
        lessons.forEachIndexed { index, lesson ->
            val streamUrl = audios.getOrNull(index) ?: return@forEachIndexed
            tracks += OnlineTrackInfo(
                externalId = lesson.slug,
                title = lesson.title,
                artist = null,
                albumTitle = albumTitle,
                artworkUrl = null,
                streamUrl = streamUrl,
                durationSec = 0,
                order = tracks.size + 1,
                pageUrl = lessonUrl(lesson.slug),
            )
        }

        if (tracks.isEmpty()) {
            throw OnlineSourceException(
                "That collection is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        }
        tracks
    }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? = guard {
        val series = seriesById(externalId) ?: return@guard null
        try {
            toCollection(series, fetchLessons(series))
        } catch (error: OnlineTransportException) {
            if (error.code == OnlineErrorCode.NotFound) null else throw error
        } catch (error: OnlineSourceException) {
            if (error.code == OnlineErrorCode.NotFound) null else throw error
        }
    }

    private suspend fun fetchLessons(series: Series): List<LessonLink> {
        val lessons = parseLessonLinks(transport.getText(archiveUrl(series))).take(MAX_SESSIONS)
        if (lessons.isEmpty()) {
            throw OnlineSourceException(
                "The source's archive has changed shape.",
                OnlineErrorCode.InvalidResponse,
            )
        }
        return lessons
    }
}

private fun seriesById(id: String): Series? = SERIES.firstOrNull { it.id == id }

private fun archiveUrl(series: Series): String = "$BASE_URL${series.path}"

private fun lessonUrl(slug: String): String = "$BASE_URL/fa/web/javadi/w/$slug"

private fun toCollection(series: Series, lessons: List<LessonLink>): OnlineCollectionInfo =
    OnlineCollectionInfo(
        key = collectionKey(esraSource.id, series.id),
        sourceId = esraSource.id,
        externalId = series.id,
        title = seriesTitleFrom(lessons, series.fallbackTitle),
        subtitle = series.label,
        artworkUrl = null,
        trackCount = lessons.size,
        languageCode = esraSource.languageCode,
        pageUrl = archiveUrl(series),
    )

private fun seriesIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != esraSource.id) {
        throw OnlineSourceException(
            "That collection is not from this source.",
            OnlineErrorCode.NotFound,
        )
    }
    return seriesById(key.substring(separator + 1))?.id
        ?: throw OnlineSourceException(
            "That collection is no longer on the source.",
            OnlineErrorCode.NotFound,
        )
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

internal data class OnlineHtmlElement(
    val tag: String,
    val attributes: String,
    val innerHtml: String,
    val start: Int,
    val end: Int,
)

private val PASSTHROUGH_VOID_TAGS = setOf(
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
)

private val OL_OPEN_TAG = Regex("(?is)<([a-zA-Z][a-zA-Z0-9:-]*)((?:\\s+[^>]*)?)>")
private val OL_CLASS_SPLIT = Regex("\\s+")

internal fun onlineHtmlElements(
    html: String,
    tag: String? = null,
    className: String? = null,
): List<OnlineHtmlElement> {
    val wantedTag = tag?.lowercase()
    val results = mutableListOf<OnlineHtmlElement>()
    for (open in OL_OPEN_TAG.findAll(html)) {
        val name = open.groupValues[1].lowercase()
        if (name in PASSTHROUGH_VOID_TAGS) continue
        if (wantedTag != null && name != wantedTag) continue
        val attributes = open.groupValues[2]
        if (className != null && !onlineHtmlHasClass(attributes, className)) continue
        if (open.value.endsWith("/>")) continue
        val innerStart = open.range.last + 1
        val closeStart = findMatchingHtmlClose(html, innerStart, name)
        if (closeStart >= html.length) continue
        val closeEnd = html.indexOf('>', closeStart).let { if (it < 0) html.length else it + 1 }
        results += OnlineHtmlElement(
            tag = name,
            attributes = attributes,
            innerHtml = html.substring(innerStart, closeStart),
            start = open.range.first,
            end = closeEnd,
        )
    }
    return results
}

internal fun onlineHtmlTagOpenings(html: String, tag: String): List<String> {
    val regex = Regex("(?is)<${Regex.escape(tag)}\\b([^>]*)>")
    return regex.findAll(html).map { it.groupValues[1] }.toList()
}

internal fun onlineHtmlAttribute(attributes: String, name: String): String? {
    val regex = Regex(
        "(?is)(?:^|\\s)${Regex.escape(name)}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
    )
    val match = regex.find(attributes) ?: return null
    val raw = match.groups[1]?.value
        ?: match.groups[2]?.value
        ?: match.groups[3]?.value
        ?: return null
    return onlineHtmlDecodeEntities(raw)
}

internal fun onlineHtmlHasClass(attributes: String, className: String): Boolean =
    onlineHtmlAttribute(attributes, "class")
        ?.split(OL_CLASS_SPLIT)
        ?.any { it == className } == true

private fun findMatchingHtmlClose(html: String, from: Int, tag: String): Int {
    val regex = Regex("(?is)</?${Regex.escape(tag)}\\b[^>]*>")
    var depth = 1
    for (match in regex.findAll(html, from)) {
        if (match.value.startsWith("</")) {
            depth -= 1
            if (depth == 0) return match.range.first
        } else if (!match.value.endsWith("/>")) {
            depth += 1
        }
    }
    return html.length
}

private val OL_NUMERIC_ENTITY = Regex("&#(?:[xX]([0-9a-fA-F]+)|(\\d+));")
private val OL_NAMED_ENTITY = Regex("&([a-zA-Z][a-zA-Z0-9]+);")

private val OL_NAMED_ENTITIES = mapOf(
    "apos" to "'",
    "quot" to "\"",
    "amp" to "&",
    "lt" to "<",
    "gt" to ">",
    "nbsp" to " ",
    "ndash" to "–",
    "mdash" to "—",
    "hellip" to "…",
    "lsquo" to "\u2018",
    "rsquo" to "\u2019",
    "ldquo" to "\u201C",
    "rdquo" to "\u201D",
)

internal fun onlineHtmlDecodeEntities(value: String): String {
    if (value.indexOf('&') < 0) return value
    val numeric = OL_NUMERIC_ENTITY.replace(value) { match ->
        val hex = match.groupValues[1]
        val decimal = match.groupValues[2]
        val code = if (hex.isNotEmpty()) hex.toIntOrNull(16) else decimal.toIntOrNull()
        if (code != null && code in 1..0x10FFFF) String(Character.toChars(code)) else match.value
    }
    return OL_NAMED_ENTITY.replace(numeric) { match ->
        OL_NAMED_ENTITIES[match.groupValues[1].lowercase()] ?: match.value
    }
}
