package com.pejvak.app.domain.online

/**
 * The online-content vocabulary (mirrors mobile/src/lib/online/types.ts). Pure:
 * no network, no database. A source is data; every source answers the same four
 * questions through [OnlineAdapter].
 */
data class OnlineLanguage(
    val code: String,
    val name: String,
    val nativeName: String,
    val isRtl: Boolean,
    val available: Boolean,
)

enum class OnlineSourceKind(val wire: String) {
    Manahej("manahej"),
    Aminikhaah("aminikhaah"),
    AminikhaahPodcasts("aminikhaahpodcasts"),
    Esra("esra"),
    Mesbah("mesbah"),
    Shariati("shariati"),
    Librivox("librivox"),
    RadioBrowser("radiobrowser"),
    Archive("archive");

    companion object { fun from(wire: String?): OnlineSourceKind? = entries.firstOrNull { it.wire == wire } }
}

data class OnlineSource(
    val id: String,
    val kind: OnlineSourceKind,
    val name: String,
    val nativeName: String,
    val languageCode: String,
    val languageCodes: List<String> = emptyList(),
    val live: Boolean = false,
    val homepage: String,
    val description: String,
    val attribution: String? = null,
)

data class OnlineCollectionInfo(
    val key: String,
    val sourceId: String,
    val externalId: String,
    val title: String,
    val subtitle: String? = null,
    val artworkUrl: String? = null,
    val trackCount: Int = 0,
    val languageCode: String,
    val pageUrl: String? = null,
)

data class OnlineTrackInfo(
    val externalId: String,
    val title: String,
    val artist: String? = null,
    val albumTitle: String? = null,
    val artworkUrl: String? = null,
    val streamUrl: String,
    val durationSec: Int = 0,
    val order: Int = 1,
    val pageUrl: String? = null,
)

enum class OnlineErrorCode { Offline, NotFound, InvalidResponse, Timeout }

class OnlineSourceException(
    message: String,
    val code: OnlineErrorCode,
    cause: Throwable? = null,
) : Exception(message, cause)

data class OnlineListOptions(val languageCode: String? = null)

/** Everything a source must be able to do: three reads and no writes. */
interface OnlineAdapter {
    val source: OnlineSource

    suspend fun listCollections(options: OnlineListOptions = OnlineListOptions()): List<OnlineCollectionInfo>

    suspend fun getTracks(collectionKey: String): List<OnlineTrackInfo>

    /** One collection by the source's own id, without scanning the catalogue. */
    suspend fun getCollection(externalId: String): OnlineCollectionInfo? = null

    suspend fun searchCollections(
        query: String,
        options: OnlineListOptions = OnlineListOptions(),
    ): List<OnlineCollectionInfo> = emptyList()

    /** Best-effort play notification for sources that count plays; never throws. */
    fun notePlaybackStarted(externalId: String) {}
}

fun collectionKey(sourceId: String, externalId: String): String = "$sourceId:$externalId"

fun parseCollectionKey(key: String): Pair<String, String>? {
    val separator = key.indexOf(':')
    if (separator <= 0 || separator == key.length - 1) return null
    return key.substring(0, separator) to key.substring(separator + 1)
}

fun sourceLanguages(source: OnlineSource): List<String> =
    if (source.languageCodes.isNotEmpty()) source.languageCodes else listOf(source.languageCode)

fun describeTrackCount(count: Int): String = "$count track" + if (count == 1) "" else "s"

fun describeKnownTrackCount(count: Int): String? = if (count > 0) describeTrackCount(count) else null

fun describeCollectionLine(subtitle: String?, trackCount: Int): String? =
    listOfNotNull(subtitle?.takeIf { it.isNotBlank() }, describeKnownTrackCount(trackCount))
        .takeIf { it.isNotEmpty() }
        ?.joinToString(" · ")

fun describeDownloadState(state: com.pejvak.app.domain.DownloadState?): String? = when (state) {
    com.pejvak.app.domain.DownloadState.Complete -> "Downloaded"
    com.pejvak.app.domain.DownloadState.Downloading -> "Downloading"
    com.pejvak.app.domain.DownloadState.Failed -> "Download failed"
    com.pejvak.app.domain.DownloadState.Cancelled -> "Download paused"
    else -> null
}

val COLLECTION_KIND_LABELS: Map<OnlineSourceKind, String> = mapOf(
    OnlineSourceKind.Manahej to "Category",
    OnlineSourceKind.Aminikhaah to "Series",
    OnlineSourceKind.AminikhaahPodcasts to "Episode",
    OnlineSourceKind.Esra to "Series",
    OnlineSourceKind.Mesbah to "Lecture",
    OnlineSourceKind.Shariati to "Audiobook",
    OnlineSourceKind.Librivox to "Audiobook",
    OnlineSourceKind.RadioBrowser to "Station",
    OnlineSourceKind.Archive to "Collection",
)
