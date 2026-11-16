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
import com.pejvak.app.domain.formatArchiveDuration
import java.net.URLEncoder
import kotlin.math.floor
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private const val BASE_URL = "https://archive.org"
private const val SEARCH_URL = "$BASE_URL/advancedsearch.php"
private const val METADATA_URL = "$BASE_URL/metadata"
private const val DOWNLOAD_URL = "$BASE_URL/download"
private const val ARTWORK_URL = "$BASE_URL/services/img"
private const val DETAILS_URL = "$BASE_URL/details"
private const val SOURCE_PREFIX = "archive-"
private const val BROWSE_ROWS = 40
private const val PLAYABLE_FORMAT = "mp3"

private val EXTENSION = Regex("\\.[a-z0-9]+$", RegexOption.IGNORE_CASE)
private val MP3_SUFFIX = Regex("\\.mp3$", RegexOption.IGNORE_CASE)
private val DIGITS = Regex("\\d+")
private val SEPARATORS = Regex("[_-]+")
private val WHITESPACE = Regex("\\s+")

private data class ArchiveLanguage(
    val code: String,
    val name: String,
    val facets: List<String>,
)

private val ARCHIVE_LANGUAGES: List<ArchiveLanguage> = listOf(
    ArchiveLanguage("ar", "Arabic", listOf("Arabic", "ar", "ara")),
    ArchiveLanguage("az", "Azerbaijani", listOf("Azerbaijani", "az", "aze")),
    ArchiveLanguage("bn", "Bengali", listOf("Bengali", "bn", "ben")),
    ArchiveLanguage("my", "Burmese", listOf("Burmese", "my", "bur", "mya")),
    ArchiveLanguage("zh", "Chinese", listOf("Chinese", "zh", "chi", "zho")),
    ArchiveLanguage("cs", "Czech", listOf("Czech", "cs", "cze", "ces")),
    ArchiveLanguage("da", "Danish", listOf("Danish", "da", "dan")),
    ArchiveLanguage("nl", "Dutch", listOf("Dutch", "nl", "dut", "nld")),
    ArchiveLanguage("en", "English", listOf("English", "en", "eng")),
    ArchiveLanguage("fi", "Finnish", listOf("Finnish", "fi", "fin")),
    ArchiveLanguage("fr", "French", listOf("French", "fr", "fre", "fra")),
    ArchiveLanguage("de", "German", listOf("German", "de", "ger", "deu")),
    ArchiveLanguage("el", "Greek", listOf("Greek", "el", "gre", "ell")),
    ArchiveLanguage("he", "Hebrew", listOf("Hebrew", "he", "heb")),
    ArchiveLanguage("hi", "Hindi", listOf("Hindi", "hi", "hin")),
    ArchiveLanguage("hu", "Hungarian", listOf("Hungarian", "hu", "hun")),
    ArchiveLanguage("id", "Indonesian", listOf("Indonesian", "id", "ind")),
    ArchiveLanguage("it", "Italian", listOf("Italian", "it", "ita")),
    ArchiveLanguage("ja", "Japanese", listOf("Japanese", "ja", "jpn")),
    ArchiveLanguage("kk", "Kazakh", listOf("Kazakh", "kk", "kaz")),
    ArchiveLanguage("ko", "Korean", listOf("Korean", "ko", "kor")),
    ArchiveLanguage("ku", "Kurdish", listOf("Kurdish", "ku", "kur")),
    ArchiveLanguage("ms", "Malay", listOf("Malay", "ms", "may", "msa")),
    ArchiveLanguage("ml", "Malayalam", listOf("Malayalam", "ml", "mal")),
    ArchiveLanguage("mr", "Marathi", listOf("Marathi", "mr", "mar")),
    ArchiveLanguage("no", "Norwegian", listOf("Norwegian", "no", "nor")),
    ArchiveLanguage("ps", "Pashto", listOf("Pashto", "ps", "pus")),
    ArchiveLanguage("fa", "Persian", listOf("Persian", "fa", "per", "fas")),
    ArchiveLanguage("pl", "Polish", listOf("Polish", "pl", "pol")),
    ArchiveLanguage("pt", "Portuguese", listOf("Portuguese", "pt", "por")),
    ArchiveLanguage("pa", "Punjabi", listOf("Punjabi", "pa", "pan")),
    ArchiveLanguage("ro", "Romanian", listOf("Romanian", "ro", "rum", "ron")),
    ArchiveLanguage("ru", "Russian", listOf("Russian", "ru", "rus")),
    ArchiveLanguage("sr", "Serbian", listOf("Serbian", "sr", "srp")),
    ArchiveLanguage("si", "Sinhala", listOf("Sinhala", "si", "sin")),
    ArchiveLanguage("es", "Spanish", listOf("Spanish", "es", "spa")),
    ArchiveLanguage("sv", "Swedish", listOf("Swedish", "sv", "swe")),
    ArchiveLanguage("tl", "Tagalog", listOf("Tagalog", "tl", "tgl")),
    ArchiveLanguage("ta", "Tamil", listOf("Tamil", "ta", "tam")),
    ArchiveLanguage("te", "Telugu", listOf("Telugu", "te", "tel")),
    ArchiveLanguage("th", "Thai", listOf("Thai", "th", "tha")),
    ArchiveLanguage("tr", "Turkish", listOf("Turkish", "tr", "tur")),
    ArchiveLanguage("uk", "Ukrainian", listOf("Ukrainian", "uk", "ukr")),
    ArchiveLanguage("ur", "Urdu", listOf("Urdu", "ur", "urd")),
    ArchiveLanguage("uz", "Uzbek", listOf("Uzbek", "uz", "uzb")),
    ArchiveLanguage("vi", "Vietnamese", listOf("Vietnamese", "vi", "vie")),
)

fun archiveLanguageFacets(code: String): List<String> =
    ARCHIVE_LANGUAGES.firstOrNull { it.code == code }?.facets.orEmpty()

fun archiveSources(): List<OnlineSource> = ARCHIVE_LANGUAGES.map { language ->
    OnlineSource(
        id = "$SOURCE_PREFIX${language.code}",
        kind = OnlineSourceKind.Archive,
        name = "Internet Archive",
        nativeName = "Internet Archive",
        languageCode = language.code,
        homepage = "$BASE_URL/search?query=${encode("language:(\"${language.name}\")")}",
        description = "Public audio in ${language.name}, free to stream or download.",
    )
}

fun createArchiveAdapter(source: OnlineSource, transport: OnlineTransport): OnlineAdapter {
    val language = ARCHIVE_LANGUAGES.firstOrNull { it.code == source.languageCode }
        ?: throw OnlineSourceException("That source has no language set.", OnlineErrorCode.InvalidResponse)
    return ArchiveAdapter(source, transport, browseQuery(language))
}

private class ArchiveAdapter(
    override val source: OnlineSource,
    private val transport: OnlineTransport,
    private val query: String,
) : OnlineAdapter {

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> = guard {
        val url = "$SEARCH_URL?q=${encode(query)}" +
            "&fl[]=identifier&fl[]=title&fl[]=creator" +
            "&rows=$BROWSE_ROWS&page=1" +
            "&sort[]=${encode("downloads desc")}" +
            "&output=json"
        val body = transport.getJson(url)
        val docs = ((body as? JsonObject)?.get("response") as? JsonObject)?.get("docs") as? JsonArray
            ?: throw OnlineSourceException(
                "The source's catalogue has changed shape.",
                OnlineErrorCode.InvalidResponse,
            )

        docs.mapNotNull { entry ->
            val doc = entry as? JsonObject ?: return@mapNotNull null
            val identifier = cleanText(doc["identifier"]) ?: return@mapNotNull null
            val title = cleanText(doc["title"]) ?: return@mapNotNull null
            OnlineCollectionInfo(
                key = collectionKey(source.id, identifier),
                sourceId = source.id,
                externalId = identifier,
                title = title,
                subtitle = cleanText(doc["creator"]),
                artworkUrl = artworkUrl(identifier),
                trackCount = 0,
                languageCode = source.languageCode,
                pageUrl = detailsUrl(identifier),
            )
        }
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = guard {
        val identifier = externalIdFromKey(source.id, collectionKey)
        val body = transport.getJson("$METADATA_URL/${encode(identifier)}")
        val root = body as? JsonObject ?: return@guard emptyList()
        val files = root["files"] as? JsonArray ?: return@guard emptyList()
        val metadata = root["metadata"] as? JsonObject ?: JsonObject(emptyMap())

        val context = TrackContext(
            identifier = identifier,
            creator = cleanText(metadata["creator"]),
            albumTitle = cleanText(metadata["title"]),
            artworkUrl = artworkUrl(identifier),
            pageUrl = detailsUrl(identifier),
        )

        val ordered = files
            .mapIndexedNotNull { index, entry -> (entry as? JsonObject)?.let { it to index } }
            .filter { isPlayableName(it.first["name"]) }
            .sortedWith(OrderComparator)

        ordered.mapNotNull { mapTrack(it.first, context) }
            .mapIndexed { index, track -> track.copy(order = index + 1) }
    }
}

private data class TrackContext(
    val identifier: String,
    val creator: String?,
    val albumTitle: String?,
    val artworkUrl: String,
    val pageUrl: String,
)

private data class OrderKey(
    val name: String,
    val track: Int?,
    val index: Int,
)

private object OrderComparator : Comparator<Pair<JsonObject, Int>> {
    override fun compare(left: Pair<JsonObject, Int>, right: Pair<JsonObject, Int>): Int =
        compareOrder(orderKey(left.first, left.second), orderKey(right.first, right.second))
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

private fun browseQuery(language: ArchiveLanguage): String {
    val languages = language.facets.joinToString(" OR ") { "language:(\"$it\")" }
    return "mediatype:(audio) AND ($languages) AND format:(\"$PLAYABLE_FORMAT\")"
}

private fun artworkUrl(identifier: String): String = "$ARTWORK_URL/${encode(identifier)}"

private fun detailsUrl(identifier: String): String = "$DETAILS_URL/${encode(identifier)}"

private fun streamUrl(identifier: String, fileName: String): String =
    "$DOWNLOAD_URL/${encode(identifier)}/${encode(fileName)}"

private fun encode(value: String): String =
    URLEncoder.encode(value, "UTF-8")
        .replace("+", "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")

private fun externalIdFromKey(sourceId: String, key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != sourceId) invalidCollection()
    val externalId = key.substring(separator + 1)
    if (externalId.isEmpty()) invalidCollection()
    return externalId
}

private fun invalidCollection(): Nothing =
    throw OnlineSourceException("That collection is not from this source.", OnlineErrorCode.NotFound)

private fun isPlayableName(value: JsonElement?): Boolean {
    val name = (value as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return false
    return name.isNotEmpty() && !name.contains('/') && MP3_SUFFIX.containsMatchIn(name)
}

private fun parseTrackNumber(value: JsonElement?): Int? {
    val primitive = value as? JsonPrimitive ?: return null
    if (primitive.isString) {
        val text = primitive.content.trim()
        if (text.isEmpty() || text.any { it !in '0'..'9' }) return null
        return text.toIntOrNull()
    }
    val number = primitive.content.toDoubleOrNull() ?: return null
    return if (number.isFinite() && number >= 0 && number == floor(number)) number.toInt() else null
}

private fun nameNumbers(name: String): List<Long> =
    DIGITS.findAll(EXTENSION.replace(name, ""))
        .mapNotNull { it.value.toLongOrNull() }
        .toList()

private fun compareNumberRuns(left: List<Long>, right: List<Long>): Int {
    if (left.isEmpty() || right.isEmpty()) return right.size - left.size
    val shared = minOf(left.size, right.size)
    for (position in 0 until shared) {
        val difference = left[position].compareTo(right[position])
        if (difference != 0) return difference
    }
    return left.size - right.size
}

private fun orderKey(file: JsonObject, index: Int): OrderKey {
    val name = (file["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
    return OrderKey(name, parseTrackNumber(file["track"]), index)
}

private fun compareOrder(left: OrderKey, right: OrderKey): Int {
    val byName = compareNumberRuns(nameNumbers(left.name), nameNumbers(right.name))
    if (byName != 0) return byName
    val leftTrack = left.track ?: Int.MAX_VALUE
    val rightTrack = right.track ?: Int.MAX_VALUE
    if (leftTrack != rightTrack) return leftTrack.compareTo(rightTrack)
    return left.index.compareTo(right.index)
}

private fun titleFromFileName(name: String): String {
    val stem = EXTENSION.replace(name, "")
    val spaced = SEPARATORS.replace(stem, " ").let { WHITESPACE.replace(it, " ") }.trim()
    return spaced.ifEmpty { name }
}

private fun mapTrack(file: JsonObject, context: TrackContext): OnlineTrackInfo? {
    val name = (file["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
    return OnlineTrackInfo(
        externalId = name,
        title = cleanText(file["title"]) ?: titleFromFileName(name),
        artist = cleanText(file["artist"]) ?: context.creator,
        albumTitle = context.albumTitle,
        artworkUrl = context.artworkUrl,
        streamUrl = streamUrl(context.identifier, name),
        durationSec = formatArchiveDuration(rawValue(file["length"])),
        pageUrl = context.pageUrl,
    )
}

private fun rawValue(value: JsonElement?): Any? = when (value) {
    null -> null
    is JsonPrimitive -> if (value.isString) value.content else value.content.toDoubleOrNull() ?: value.content
    else -> null
}

private fun asString(value: JsonElement?): String? {
    when (value) {
        is JsonPrimitive -> if (value.isString) return value.content
        is JsonArray -> for (entry in value) {
            if (entry is JsonPrimitive && entry.isString && entry.content.trim().isNotEmpty()) {
                return entry.content
            }
        }
        else -> Unit
    }
    return null
}

private fun cleanText(value: JsonElement?): String? {
    val raw = asString(value) ?: return null
    return decodeEntities(raw).trim().takeIf { it.isNotEmpty() }
}

private fun decodeEntities(value: String): String = value
    .replace(Regex("&#0?39;|&apos;|&#8217;"), "'")
    .replace(Regex("&#0?34;|&quot;|&#8220;|&#8221;"), "\"")
    .replace(Regex("&#0?38;|&amp;"), "&")
    .replace("&#8211;", "–")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&nbsp;", " ")
