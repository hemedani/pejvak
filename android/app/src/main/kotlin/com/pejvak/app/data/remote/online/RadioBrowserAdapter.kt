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
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private const val SERVERS_URL = "https://all.api.radio-browser.info/json/servers"
private const val FALLBACK_HOST = "all.api.radio-browser.info"
private const val SERVERS_TTL_MS = 10 * 60_000L
private const val CLICK_THROTTLE_MS = 10 * 60_000L
private const val BROWSE_ROWS = 40
private const val SEARCH_ROWS = 40
private const val RADIO_BROWSER_USER_AGENT = "Pejvak/1.0 (offline-first audio player)"

private val REQUEST_HEADERS = mapOf("User-Agent" to RADIO_BROWSER_USER_AGENT)
private val HTTP_URL = Regex("^https?://", RegexOption.IGNORE_CASE)
private val LANGUAGE_SEPARATOR = Regex("[\\s,;]+")

private val LANGUAGE_NAMES: Map<String, String> = mapOf("de" to "german", "nl" to "dutch")
private val CODE_BY_LANGUAGE_TOKEN: Map<String, String> = mapOf("german" to "de", "dutch" to "nl")

private var serversCache: Pair<Long, List<String>>? = null
private val clickSentAt = ConcurrentHashMap<String, Long>()
private val clickScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

val radioBrowserSource: OnlineSource = OnlineSource(
    id = "radiobrowser",
    kind = OnlineSourceKind.RadioBrowser,
    name = "Radio Browser",
    nativeName = "Radio Browser",
    languageCode = "de",
    languageCodes = listOf("de", "nl"),
    live = true,
    homepage = "https://www.radio-browser.info",
    description = "Live radio stations from the community-run directory.",
    attribution = "Station data from Radio Browser, a community-run directory.",
)

fun createRadioBrowserAdapter(transport: OnlineTransport): OnlineAdapter =
    RadioBrowserAdapter(transport)

private data class Station(
    val stationUuid: String,
    val name: String?,
    val urlResolved: String?,
    val homepage: String?,
    val favicon: String?,
    val country: String?,
    val countryCode: String?,
    val language: String?,
    val lastCheckOk: String?,
)

private class RadioBrowserAdapter(private val transport: OnlineTransport) : OnlineAdapter {
    override val source: OnlineSource = radioBrowserSource

    override suspend fun listCollections(options: OnlineListOptions): List<OnlineCollectionInfo> =
        onlineGuard {
            val languageCode = options.languageCode ?: source.languageCode
            val languageName = LANGUAGE_NAMES[languageCode] ?: return@onlineGuard emptyList()
            val body = requestRadio(
                stationListUrl(
                    "/json/stations/bylanguage/${encodeQueryComponent(languageName)}",
                    emptyMap(),
                ),
            )
            mapStations(body, languageCode, BROWSE_ROWS)
        }

    override suspend fun searchCollections(
        query: String,
        options: OnlineListOptions,
    ): List<OnlineCollectionInfo> = onlineGuard {
        val text = query.trim()
        if (text.isEmpty()) return@onlineGuard emptyList()
        val languageCode = options.languageCode ?: source.languageCode
        val languageName = LANGUAGE_NAMES[languageCode]
        val parameters = linkedMapOf(
            "name" to text,
            "limit" to SEARCH_ROWS.toString(),
        )
        if (languageName != null) parameters["language"] = languageName

        val body = requestRadio(stationListUrl("/json/stations/search", parameters))
        mapStations(body, languageCode, SEARCH_ROWS)
    }

    override suspend fun getCollection(externalId: String): OnlineCollectionInfo? = onlineGuard {
        val station = fetchStation(externalId) ?: return@onlineGuard null
        toCollection(station, null)
    }

    override suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo> = onlineGuard {
        val externalId = externalIdFromKey(collectionKey)
        val station = fetchStation(externalId)
            ?: throw OnlineSourceException(
                "That station is no longer on the source.",
                OnlineErrorCode.NotFound,
            )
        val collection = toCollection(station, null)
        val name = cleanOnlineText(station.name).takeIf { it.isNotEmpty() }
        val streamUrl = cleanedUrl(station.urlResolved)
        if (collection == null || name == null || streamUrl == null || !isHealthy(station)) {
            throw OnlineSourceException(
                "That station is no longer playable.",
                OnlineErrorCode.NotFound,
            )
        }

        listOf(
            OnlineTrackInfo(
                externalId = externalId,
                title = name,
                artist = collection.subtitle,
                albumTitle = null,
                artworkUrl = collection.artworkUrl,
                streamUrl = streamUrl,
                durationSec = 0,
                order = 1,
                pageUrl = collection.pageUrl,
            ),
        )
    }

    override fun notePlaybackStarted(externalId: String) {
        val now = System.currentTimeMillis()
        val last = clickSentAt[externalId]
        if (last != null && now - last < CLICK_THROTTLE_MS) return
        clickSentAt[externalId] = now
        clickScope.launch {
            runCatching {
                requestRadio("/json/url/${encodeQueryComponent(externalId)}")
            }
        }
    }

    private suspend fun discoverHosts(): List<String> {
        val cached = serversCache
        if (cached != null && System.currentTimeMillis() - cached.first < SERVERS_TTL_MS) {
            return cached.second
        }

        val hosts = mutableListOf<String>()
        try {
            val body = transport.getJson(SERVERS_URL, REQUEST_HEADERS)
            val servers = body as? JsonArray
            if (servers != null) {
                val seen = mutableSetOf<String>()
                for (entry in servers) {
                    val server = entry as? JsonObject ?: continue
                    val name = server["name"].jsonString()
                        ?.takeIf { it.isNotEmpty() }
                        ?: continue
                    if (seen.add(name)) hosts.add(name)
                }
            }
        } catch (error: OnlineTransportException) {
        }

        val resolved = hosts.ifEmpty { listOf(FALLBACK_HOST) }
        serversCache = System.currentTimeMillis() to resolved
        return resolved
    }

    private suspend fun requestRadio(path: String): JsonElement {
        val hosts = shuffledHosts(discoverHosts())
        var lastError: OnlineTransportException? = null
        for (host in hosts) {
            try {
                return transport.getJson("https://$host$path", REQUEST_HEADERS)
            } catch (error: OnlineTransportException) {
                lastError = error
            }
        }
        throw lastError
            ?: OnlineSourceException("Could not reach the source.", OnlineErrorCode.Offline)
    }

    private suspend fun fetchStation(externalId: String): Station? {
        val body = requestRadio("/json/stations/byuuid/${encodeQueryComponent(externalId)}")
        for (entry in parseStations(body)) {
            val station = parseStation(entry)
            if (station != null) return station
        }
        return null
    }
}

private fun shuffledHosts(hosts: List<String>): List<String> {
    if (hosts.size <= 1) return hosts.toList()
    val start = Random.nextInt(hosts.size)
    return hosts.drop(start) + hosts.take(start)
}

private fun parseStations(body: JsonElement): List<JsonElement> =
    body as? JsonArray ?: throw catalogueChanged()

private fun mapStations(
    body: JsonElement,
    requestedLanguage: String?,
    limit: Int,
): List<OnlineCollectionInfo> {
    val collections = mutableListOf<OnlineCollectionInfo>()
    for (raw in parseStations(body)) {
        val station = parseStation(raw) ?: continue
        val collection = toCollection(station, requestedLanguage) ?: continue
        collections.add(collection)
        if (collections.size >= limit) break
    }
    return collections
}

private fun toCollection(
    station: Station,
    requestedLanguage: String?,
): OnlineCollectionInfo? {
    val name = cleanOnlineText(station.name).takeIf { it.isNotEmpty() } ?: return null
    val streamUrl = cleanedUrl(station.urlResolved) ?: return null
    if (!isHealthy(station)) return null

    val fallbackLanguage = requestedLanguage ?: radioBrowserSource.languageCode
    val codes = stationLanguageCodes(station.language)
    if (requestedLanguage != null && codes.isNotEmpty() && !codes.contains(requestedLanguage)) {
        return null
    }
    val languageCode = if (requestedLanguage != null && codes.contains(requestedLanguage)) {
        requestedLanguage
    } else {
        codes.firstOrNull() ?: fallbackLanguage
    }

    return OnlineCollectionInfo(
        key = collectionKey(radioBrowserSource.id, station.stationUuid),
        sourceId = radioBrowserSource.id,
        externalId = station.stationUuid,
        title = name,
        subtitle = cleanOnlineText(station.country).takeIf { it.isNotEmpty() }
            ?: cleanOnlineText(station.countryCode).takeIf { it.isNotEmpty() },
        artworkUrl = cleanedUrl(station.favicon),
        trackCount = 1,
        languageCode = languageCode,
        pageUrl = cleanedUrl(station.homepage),
    )
}

private fun parseStation(element: JsonElement): Station? {
    val station = element as? JsonObject ?: return null
    val uuid = station["stationuuid"].jsonString()
        ?.takeIf { it.isNotEmpty() }
        ?: return null
    if (!isOptionalString(station["name"])) return null
    if (!isOptionalString(station["url_resolved"])) return null
    if (!isOptionalString(station["homepage"])) return null
    if (!isOptionalString(station["favicon"])) return null
    if (!isOptionalString(station["country"])) return null
    if (!isOptionalString(station["countrycode"])) return null
    if (!isOptionalString(station["language"])) return null
    if (!isOptionalString(station["tags"])) return null
    if (!isOptionalNumber(station["votes"])) return null
    if (!isOptionalNumber(station["clickcount"])) return null
    if (!isOptionalNumberOrString(station["lastcheckok"])) return null

    return Station(
        stationUuid = uuid,
        name = station["name"].jsonString(),
        urlResolved = station["url_resolved"].jsonString(),
        homepage = station["homepage"].jsonString(),
        favicon = station["favicon"].jsonString(),
        country = station["country"].jsonString(),
        countryCode = station["countrycode"].jsonString(),
        language = station["language"].jsonString(),
        lastCheckOk = station["lastcheckok"].jsonText(),
    )
}

private fun stationLanguageCodes(value: String?): List<String> {
    val text = cleanOnlineText(value).lowercase().takeIf { it.isNotEmpty() }
        ?: return emptyList()
    val codes = linkedSetOf<String>()
    for (token in text.split(LANGUAGE_SEPARATOR)) {
        CODE_BY_LANGUAGE_TOKEN[token]?.let { codes.add(it) }
    }
    return codes.toList()
}

private fun isHealthy(station: Station): Boolean = station.lastCheckOk == "1"

private fun isHttpUrl(value: String?): Boolean =
    value != null && HTTP_URL.containsMatchIn(value.trim())

private fun cleanedUrl(value: String?): String? {
    val text = cleanOnlineText(value).takeIf { it.isNotEmpty() } ?: return null
    return text.takeIf { isHttpUrl(it) }
}

private fun isOptionalString(element: JsonElement?): Boolean =
    element == null || element is JsonNull || (element is JsonPrimitive && element.isString)

private fun isOptionalNumber(element: JsonElement?): Boolean {
    if (element == null || element is JsonNull) return true
    val primitive = element as? JsonPrimitive ?: return false
    return !primitive.isString && primitive.content.toDoubleOrNull() != null
}

private fun isOptionalNumberOrString(element: JsonElement?): Boolean {
    if (element == null || element is JsonNull) return true
    val primitive = element as? JsonPrimitive ?: return false
    return primitive.isString || primitive.content.toDoubleOrNull() != null
}

private fun stationListUrl(path: String, parameters: Map<String, String>): String {
    val query = linkedMapOf(
        "limit" to BROWSE_ROWS.toString(),
        "order" to "votes",
        "reverse" to "true",
        "hidebroken" to "true",
    )
    query.putAll(parameters)
    val encoded = query.entries.joinToString("&") { (key, value) ->
        "${formEncode(key)}=${formEncode(value)}"
    }
    return "$path?$encoded"
}

private fun externalIdFromKey(key: String): String {
    val separator = key.indexOf(':')
    if (separator < 0 || key.substring(0, separator) != radioBrowserSource.id) {
        invalidCollection()
    }
    val externalId = key.substring(separator + 1)
    if (externalId.isEmpty()) invalidCollection()
    return externalId
}

private fun invalidCollection(): Nothing =
    throw OnlineSourceException("That collection is not from this source.", OnlineErrorCode.NotFound)

private fun catalogueChanged(): OnlineSourceException =
    OnlineSourceException("The source's catalogue has changed shape.", OnlineErrorCode.InvalidResponse)
