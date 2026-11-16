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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private const val API_URL = "https://librivox.org/api/feed/audiobooks/"
private const val TRACKS_URL = "https://librivox.org/api/feed/audiotracks/"
private const val BASE_URL = "https://librivox.org"

private const val BROWSE_ROWS = 40
private const val PAGE_SIZE = 500
private const val MAX_SCAN_PAGES = 6
private const val SEARCH_ROWS = 40
private const val SEARCH_PAGE_SIZE = 100

private const val BOOK_FIELDS =
    "id,title,language,authors,num_sections,url_librivox,totaltimesecs," +
        "coverart_thumbnail,coverart_jpg"

private val HTTP_URL = Regex("^https?://", RegexOption.IGNORE_CASE)
private val DIGITS = Regex("^\\d+$")

private val LANGUAGE_NAMES: Map<String, String> = mapOf("de" to "German", "nl" to "Dutch")
private val CODE_BY_NAME: Map<String, String> = mapOf("german" to "de", "dutch" to "nl")

val librivoxSource: OnlineSource = OnlineSource(
    id = "librivox",
    kind = OnlineSourceKind.Librivox,
    name = "LibriVox",
    nativeName = "LibriVox",
    languageCode = "de",
    languageCodes = listOf("de", "nl"),
    homepage = BASE_URL,
    description = "Public-domain audiobooks read by volunteers.",
    attribution = "Audiobooks from LibriVox, public domain.",
)

fun createLibrivoxAdapter(transport: OnlineTransport): OnlineAdapter =
    LibrivoxAdapter(transport)

private data class Author(val firstName: String?, val lastName: String?)

private data class Book(
    val id: String,
    val title: String?,
    val language: String?,
    val numSections: Int,
    val urlLibrivox: String?,
    val coverartThumbnail: String?,
    val coverartJpg: String?,
    val authors: List<Author>,
)

private data class Section(
    val id: String,
    val sectionNumber: Int,
    val title: String?,
    val listenUrl: String?,
    val playtime: Int,
)

private class LibrivoxAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = librivoxSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> =
        onlineGuard {
            val languageCode = options.languageCode ?: source.languageCode
            val languageName = LANGUAGE_NAMES[languageCode] ?: return@onlineGuard emptyList()

            val collections = mutableListOf<OnlineCollectionInfo>()
            var offset = 0

            for (page in 0 until MAX_SCAN_PAGES) {
                val body = transport.getJson(
                    booksUrl(
                        linkedMapOf(
                            "limit" to PAGE_SIZE.toString(),
                            "offset" to offset.toString(),
                            "sort_order" to "asc",
                        ),
                    ),
                )
                val books = parseBooks(body)

                for (raw in books) {
                    val collection = mapBook(raw, languageCode)
                    if (collection != null) collections.add(collection)
                    if (collections.size >= BROWSE_ROWS) break
                }

                if (books.size < PAGE_SIZE || collections.size >= BROWSE_ROWS) break
                offset += PAGE_SIZE
            }

            collections.take(BROWSE_ROWS)
        }

    override suspend fun searchCollections(
        query: String,
        options: OnlineListOptions,
    ): List<OnlineCollectionInfo> = onlineGuard {
        val text = query.trim()
        if (text.isEmpty()) return@onlineGuard emptyList()
        val languageCode = options.languageCode ?: source.languageCode

        val responses = supervisorScope {
            listOf("title", "author").map { field ->
                async {
                    try {
                        Result.success(
                            transport.getJson(
                                booksUrl(
                                    linkedMapOf(
                                        field to text,
                                        "limit" to SEARCH_PAGE_SIZE.toString(),
                                        "sort_order" to "asc",
                                    ),
                                ),
                            ),
                        )
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        Result.failure<JsonElement>(error)
                    }
                }
            }.map { it.await() }
        }

        val succeeded = responses.mapNotNull { it.getOrNull() }
        if (succeeded.isEmpty()) {
            val firstError = responses.firstNotNullOfOrNull { it.exceptionOrNull() }
            throw firstError
                ?: OnlineSourceException("Could not reach the source.", OnlineErrorCode.Offline)
        }

        val seen = mutableSetOf<String>()
        val collections = mutableListOf<OnlineCollectionInfo>()
        for (body in succeeded) {
            for (raw in parseBooks(body)) {
                val collection = mapBook(raw, languageCode) ?: continue
                if (!seen.add(collection.key)) continue
                collections.add(collection)
                if (collections.size >= SEARCH_ROWS) return@onlineGuard collections
            }
        }
        collections
    }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? = onlineGuard {
        val body = transport.getJson(booksUrl(linkedMapOf("id" to externalId, "limit" to "1")))
        for (raw in parseBooks(body)) {
            val collection = mapBook(raw, null)
            if (collection != null) return@onlineGuard collection
        }
        null
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = onlineGuard {
        val projectId = externalIdFromKey(collectionKey)
        val url = "$TRACKS_URL?project_id=${formEncode(projectId)}&format=json"
        val body = transport.getJson(url)

        val root = body as? JsonObject ?: throw noLongerOnSource()
        val sections = root["sections"] as? JsonArray ?: throw noLongerOnSource()

        val entries = mutableListOf<Pair<Section, Int>>()
        sections.forEachIndexed { index, raw ->
            parseSection(raw)?.let { entries.add(it to index) }
        }

        entries.sortWith(
            compareBy<Pair<Section, Int>> { sectionOrder(it.first, it.second) }
                .thenBy { it.second },
        )

        val tracks = mutableListOf<OnlineTrackInfo>()
        for ((section, _) in entries) {
            val streamUrl = cleanedUrl(section.listenUrl) ?: continue
            val order = tracks.size + 1
            tracks.add(
                OnlineTrackInfo(
                    externalId = section.id,
                    title = section.title ?: "Section $order",
                    artist = null,
                    albumTitle = null,
                    artworkUrl = null,
                    streamUrl = streamUrl,
                    durationSec = section.playtime,
                    order = order,
                    pageUrl = null,
                ),
            )
        }
        tracks
    }
}

private fun mapBook(raw: JsonElement, requestedLanguage: String?): OnlineCollectionInfo? {
    val book = parseBook(raw) ?: return null
    val title = book.title ?: return null
    val languageName = book.language
    val actualCode = languageName?.let { CODE_BY_NAME[it.lowercase()] }
    if (requestedLanguage != null && actualCode != requestedLanguage) return null
    val languageCode = actualCode ?: requestedLanguage ?: librivoxSource.languageCode

    val cover = cleanedUrl(book.coverartThumbnail) ?: cleanedUrl(book.coverartJpg)

    return OnlineCollectionInfo(
        key = collectionKey(librivoxSource.id, book.id),
        sourceId = librivoxSource.id,
        externalId = book.id,
        title = title,
        subtitle = authorNames(book),
        artworkUrl = cover,
        trackCount = book.numSections,
        languageCode = languageCode,
        pageUrl = cleanedUrl(book.urlLibrivox),
    )
}

private fun parseBook(element: JsonElement): Book? {
    val book = element as? JsonObject ?: return null
    if (!isIdValue(book["id"])) return null
    if (!isOptionalString(book["title"])) return null
    if (!isOptionalString(book["language"])) return null
    if (!isOptionalCount(book["num_sections"])) return null
    if (!isOptionalNumber(book["totaltimesecs"])) return null
    if (!isOptionalString(book["url_librivox"])) return null
    if (!isOptionalString(book["coverart_thumbnail"])) return null
    if (!isOptionalString(book["coverart_jpg"])) return null

    val authorElement = book["authors"]
    val authors = when (authorElement) {
        null, JsonNull -> emptyList()
        is JsonArray -> authorElement.mapNotNull { parseAuthor(it) ?: return null }
        else -> return null
    }

    val id = idOf(book["id"]) ?: return null
    return Book(
        id = id,
        title = book["title"].cleanJsonText(),
        language = book["language"].cleanJsonText(),
        numSections = parseCount(book["num_sections"]),
        urlLibrivox = book["url_librivox"].jsonString(),
        coverartThumbnail = book["coverart_thumbnail"].jsonString(),
        coverartJpg = book["coverart_jpg"].jsonString(),
        authors = authors,
    )
}

private fun parseAuthor(element: JsonElement): Author? {
    val author = element as? JsonObject ?: return null
    if (!isOptionalString(author["first_name"])) return null
    if (!isOptionalString(author["last_name"])) return null
    return Author(
        firstName = author["first_name"].cleanJsonText(),
        lastName = author["last_name"].cleanJsonText(),
    )
}

private fun parseSection(element: JsonElement): Section? {
    val section = element as? JsonObject ?: return null
    if (!isIdValue(section["id"])) return null
    if (!isOptionalCount(section["section_number"])) return null
    if (!isOptionalString(section["title"])) return null
    if (!isOptionalString(section["listen_url"])) return null
    if (!isOptionalCount(section["playtime"])) return null

    return Section(
        id = idOf(section["id"]) ?: return null,
        sectionNumber = parseCount(section["section_number"]),
        title = section["title"].cleanJsonText(),
        listenUrl = section["listen_url"].jsonString(),
        playtime = parseCount(section["playtime"]),
    )
}

private fun parseBooks(body: JsonElement): List<JsonElement> {
    val root = body as? JsonObject ?: throw catalogueChanged()
    val books = root["books"]
    if (books !is JsonArray) throw catalogueChanged()
    return books
}

private fun idOf(element: JsonElement?): String? {
    val primitive = element as? JsonPrimitive ?: return null
    if (primitive is JsonNull) return null
    return primitive.content.trim().takeIf { it.isNotEmpty() }
}

private fun parseCount(element: JsonElement?): Int {
    val primitive = element as? JsonPrimitive ?: return 0
    if (primitive is JsonNull) return 0
    if (primitive.isString) {
        val text = primitive.content.trim()
        if (!DIGITS.matches(text)) return 0
        val parsed = text.toLongOrNull() ?: return 0
        return if (parsed in 1..Int.MAX_VALUE.toLong()) parsed.toInt() else 0
    }
    val number = primitive.content.toDoubleOrNull() ?: return 0
    if (!number.isFinite() || number <= 0) return 0
    val rounded = Math.round(number)
    return if (rounded <= Int.MAX_VALUE) rounded.toInt() else 0
}

private fun isIdValue(element: JsonElement?): Boolean {
    val primitive = element as? JsonPrimitive ?: return false
    if (primitive is JsonNull) return false
    return primitive.isString || primitive.content.toDoubleOrNull() != null
}

private fun isOptionalString(element: JsonElement?): Boolean =
    element == null || element is JsonNull || (element is JsonPrimitive && element.isString)

private fun isOptionalNumber(element: JsonElement?): Boolean {
    if (element == null || element is JsonNull) return true
    val primitive = element as? JsonPrimitive ?: return false
    return !primitive.isString && primitive.content.toDoubleOrNull() != null
}

private fun isOptionalCount(element: JsonElement?): Boolean {
    if (element == null || element is JsonNull) return true
    val primitive = element as? JsonPrimitive ?: return false
    return primitive.isString || primitive.content.toDoubleOrNull() != null
}

private fun authorNames(book: Book): String? {
    val names = book.authors.mapNotNull { author ->
        listOfNotNull(author.firstName, author.lastName)
            .joinToString(" ")
            .trim()
            .takeIf { it.isNotEmpty() }
    }
    return if (names.isEmpty()) null else names.joinToString(", ")
}

private fun isHttpUrl(value: String?): Boolean =
    value != null && HTTP_URL.containsMatchIn(value.trim())

private fun cleanedUrl(value: String?): String? {
    val text = cleanOnlineText(value).takeIf { it.isNotEmpty() } ?: return null
    return text.takeIf { isHttpUrl(it) }
}

private fun booksUrl(parameters: Map<String, String>): String {
    val query = linkedMapOf(
        "format" to "json",
        "fields" to BOOK_FIELDS,
        "coverart" to "1",
    )
    query.putAll(parameters)
    val encoded = query.entries.joinToString("&") { (key, value) ->
        "${formEncode(key)}=${formEncode(value)}"
    }
    return "$API_URL?$encoded"
}

private fun sectionOrder(section: Section, index: Int): Long =
    if (section.sectionNumber > 0) {
        section.sectionNumber.toLong()
    } else {
        Long.MAX_VALUE - (100_000L - index)
    }

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != librivoxSource.id) invalidCollection()
    val externalId = key.substring(separator + 1)
    if (externalId.isEmpty()) invalidCollection()
    return externalId
}

private fun invalidCollection(): Nothing =
    throw OnlineSourceException("That collection is not from this source.", OnlineErrorCode.NotFound)

private fun catalogueChanged(): OnlineSourceException =
    OnlineSourceException("The source's catalogue has changed shape.", OnlineErrorCode.InvalidResponse)

private fun noLongerOnSource(): OnlineSourceException =
    OnlineSourceException("That collection is no longer on the source.", OnlineErrorCode.NotFound)
