package com.pejvak.app.domain.channel

import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.Track

/**
 * The Listener Channels vocabulary (plan 07). Pure: no Android imports, no network,
 * no database — the same discipline as the rest of `domain/`.
 *
 * A **channel** is a creator's public, user-made audio shelf; a **channelPlaylist**
 * is a folder inside it; a **channelAudio** is one hosted episode. These are three
 * distinct concepts (prompt D3): NOT the Discover "online resources" shelf and NOT
 * the personal `playlist` model. The phone mirrors them read-only (prompt D2) —
 * every type here carries `isMine` and `cachedAt` for that mirror, never a sync flag.
 *
 * Durations/positions are integer seconds; timestamps are epoch millis (project rule).
 */

enum class ChannelStatus(val wire: String) {
    Active("active"), Removed("removed");

    companion object {
        fun from(wire: String?): ChannelStatus = entries.firstOrNull { it.wire == wire } ?: Active
    }
}

/** A `socials[]` entry on the server: a platform slug and the creator's profile URL. */
data class ChannelSocial(val platform: String, val url: String)

/** A creator's public channel, mirrored from the server. */
data class Channel(
    val serverId: String,
    val slug: String,
    val name: String,
    val bio: String? = null,
    val categories: List<String> = emptyList(),
    val languageCode: String? = null,
    val avatarUrl: String? = null,
    val gallery: List<String> = emptyList(),
    val donationUrl: String? = null,
    val websiteUrl: String? = null,
    val socials: List<ChannelSocial> = emptyList(),
    val contactEmail: String? = null,
    val status: ChannelStatus = ChannelStatus.Active,
    val audioCount: Int = 0,
    val playlistCount: Int = 0,
    val creatorId: String? = null,
    val creatorUsername: String? = null,
    val creatorDisplayName: String? = null,
    val creatorAvatarUrl: String? = null,
    val isMine: Boolean = false,
    val cachedAt: Long,
    val createdAt: Long? = null,
    val updatedAt: Long? = null,
)

/** A folder inside one channel ("the playlist almost acts like a folder"). */
data class ChannelPlaylist(
    val serverId: String,
    val channelServerId: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val sortOrder: Int = 0,
    val audioCount: Int = 0,
    val isMine: Boolean = false,
    val cachedAt: Long,
)

/** One hosted episode/chapter. `audioUrl` is durable (we host the bytes) — never a re-resolve. */
data class ChannelAudio(
    val serverId: String,
    val channelServerId: String,
    val playlistServerId: String? = null,
    val contentHash: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val audioUrl: String,
    val durationSec: Int = 0,
    /**
     * Server-computed loudness strip (0..1, left→right) for a streamed episode. Empty
     * when the backend has not generated it yet; the player then falls back to the
     * seeded sample. See `wireWaveform`.
     */
    val waveform: List<Float> = emptyList(),
    val fileSizeBytes: Long = 0,
    val mimeType: String? = null,
    val isAudiobook: Boolean = false,
    val author: String? = null,
    val narrator: String? = null,
    val artworkUrl: String? = null,
    val position: Int = 0,
    val languageCode: String? = null,
    val status: ChannelStatus = ChannelStatus.Active,
    val downloadState: com.pejvak.app.domain.DownloadState = com.pejvak.app.domain.DownloadState.None,
    /** Absolute local file path once the episode is downloaded for offline play (U05); null otherwise. */
    val localPath: String? = null,
    val isMine: Boolean = false,
    val cachedAt: Long,
)

/**
 * The run identity for a channel (prompt D7). A channel is streamed from a URL we
 * host, so it reuses the `Online` origin with a `channel:` context key rather than a
 * new `ContextType` — history, stretches and annotations then follow the existing
 * code path keyed on `contentHash`. The prefix keeps the key distinct from a
 * third-party `sourceId:externalId` online key.
 */
const val CHANNEL_CONTEXT_PREFIX: String = "channel:"

fun channelContextKey(channelServerId: String): String = CHANNEL_CONTEXT_PREFIX + channelServerId

/**
 * Resolves a server `audioUrl` to a streamable URL (prompt D11 — the critical rule).
 * The backend returns either an absolute URL (when `MEDIA_BASE_URL` is set) or a
 * root-relative `/uploads/...` path. The app must prepend the server origin only to
 * the root-relative form.
 */
fun resolveAudioUrl(audioUrl: String, serverOrigin: String): String {
    val trimmed = audioUrl.trim()
    return when {
        trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true) -> trimmed
        trimmed.startsWith("//") -> schemeOf(serverOrigin) + trimmed
        trimmed.startsWith("/") -> serverOrigin.trimEnd('/') + trimmed
        else -> serverOrigin.trimEnd('/') + "/" + trimmed
    }
}

private fun schemeOf(origin: String): String =
    if (origin.startsWith("https", ignoreCase = true)) "https:" else "http:"

/**
 * The origin (`scheme://host[:port]`) of a Lesan base URL. The base is
 * `http://host:port/lesan`, so the origin is everything up to (excluding) the first
 * `/` after the scheme's `//`. Used to resolve a root-relative `audioUrl` (D11) and
 * to build the multipart upload endpoint's parent.
 */
fun serverOriginFromBaseUrl(baseUrl: String): String {
    val schemeEnd = baseUrl.indexOf("://")
    if (schemeEnd < 0) return baseUrl.trimEnd('/')
    val pathStart = baseUrl.indexOf('/', schemeEnd + 3)
    return if (pathStart < 0) baseUrl.trimEnd('/') else baseUrl.substring(0, pathStart)
}

/**
 * Materialises a channel episode into the player's `Track` (prompt D1). It is an
 * `Online`-origin track whose stream URL is the resolved `audioUrl` and whose run is
 * the channel's `channel:` context key — so the queue/run/history machinery treats it
 * as a streamed collection member with no second playback path. `contentHash` is the
 * server's own identity (computed on device at upload), so a listener's history and
 * notes follow it unchanged.
 */
fun channelAudioToTrack(
    audio: ChannelAudio,
    channelName: String,
    serverOrigin: String,
    localFileUri: String? = null,
    now: Long = System.currentTimeMillis(),
): Track {
    val streamUrl = resolveAudioUrl(audio.audioUrl, serverOrigin)
    // A downloaded episode plays from its local file (offline); the resolved stream URL
    // stays on the row so a delete-then-replay falls back to streaming with no new code.
    val offline = !localFileUri.isNullOrBlank()
    return Track(
        id = audio.contentHash,
        serverId = audio.serverId,
        contentHash = audio.contentHash,
        title = audio.title,
        fileUri = if (offline) localFileUri else streamUrl,
        durationSec = audio.durationSec,
        fileSizeBytes = audio.fileSizeBytes,
        mimeType = audio.mimeType,
        isAudiobook = audio.isAudiobook,
        author = audio.author,
        narrator = audio.narrator,
        artworkUrl = audio.artworkUrl,
        syncStatus = SyncStatus.Synced,
        createdAt = audio.cachedAt,
        updatedAt = now,
        availability = if (offline) Availability.Present else Availability.Missing,
        origin = Origin.Online,
        streamUrl = streamUrl,
        sourceId = "channel",
        externalId = audio.serverId,
        collectionKey = channelContextKey(audio.channelServerId),
        collectionTitle = channelName,
        downloadPath = if (offline) localFileUri else null,
    )
}

/** A channel is publicly browsable only when it is `active` (prompt D9/D10). */
fun channelIsPublic(channel: Channel): Boolean = channel.status == ChannelStatus.Active

/**
 * The on-device leaf name for a downloaded episode (U05): keyed on `contentHash`
 * (the identity) so re-downloading the same audio overwrites in place and a rename
 * on the server never orphans the file. The extension comes from the mime type,
 * defaulting to `.mp3`. Pure — the directory lives in the data layer.
 */
fun channelDownloadFileName(contentHash: String, mimeType: String?): String {
    val ext = when (mimeType?.lowercase()?.trim()) {
        "audio/mpeg", "audio/mp3" -> "mp3"
        "audio/mp4", "audio/m4a", "audio/aac" -> "m4a"
        "audio/ogg", "application/ogg" -> "ogg"
        "audio/webm" -> "webm"
        "audio/flac" -> "flac"
        "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
        "audio/aiff", "audio/x-aiff" -> "aiff"
        else -> "mp3"
    }
    val safeHash = contentHash.filter { it.isLetterOrDigit() }.ifBlank { "audio" }
    return "$safeHash.$ext"
}

/** A visible, non-empty subtitle line for a channel card: creator · audio count. */
fun channelSubtitle(channel: Channel): String? =
    listOfNotNull(
        channel.creatorDisplayName?.takeIf { it.isNotBlank() }
            ?: channel.creatorUsername?.takeIf { it.isNotBlank() }
            ?.let { "@$it" },
        if (channel.audioCount > 0) "${channel.audioCount} audio" + if (channel.audioCount == 1) "" else "s" else null,
    ).takeIf { it.isNotEmpty() }?.joinToString(" · ")

/**
 * Creator form state (plan 07 A3). Pure + testable: a draft is what a create/edit sheet
 * holds and what the write acts serialize. Validation mirrors the server's act rules so
 * the form blocks an obviously-refused submit (empty name, or zero categories — prompt D5)
 * with an inline message instead of a round-trip 501; the server stays authoritative.
 */
data class ChannelDraft(
    val name: String = "",
    val bio: String = "",
    val categories: List<String> = emptyList(),
    val languageCode: String? = null,
    val avatarUrl: String? = null,
    val gallery: List<String> = emptyList(),
    val donationUrl: String = "",
    val websiteUrl: String = "",
    val socials: List<ChannelSocial> = emptyList(),
    val contactEmail: String = "",
) {
    val nameValid: Boolean get() = name.isNotBlank()
    val categoriesValid: Boolean get() = categories.isNotEmpty()
    val isValid: Boolean get() = nameValid && categoriesValid

    fun toChannel(existing: Channel?, cachedAt: Long, isMine: Boolean): Channel {
        val base = existing ?: Channel(serverId = "", slug = "", name = name, cachedAt = cachedAt)
        return base.copy(
            name = name.trim(),
            bio = bio.trim().ifBlank { null },
            categories = categories,
            languageCode = languageCode,
            avatarUrl = avatarUrl,
            gallery = gallery,
            donationUrl = donationUrl.trim().ifBlank { null },
            websiteUrl = websiteUrl.trim().ifBlank { null },
            socials = socials.filter { it.url.isNotBlank() },
            contactEmail = contactEmail.trim().ifBlank { null },
            isMine = isMine,
            cachedAt = cachedAt,
        )
    }

    companion object {
        fun from(channel: Channel): ChannelDraft = ChannelDraft(
            name = channel.name,
            bio = channel.bio.orEmpty(),
            categories = channel.categories,
            languageCode = channel.languageCode,
            avatarUrl = channel.avatarUrl,
            gallery = channel.gallery,
            donationUrl = channel.donationUrl.orEmpty(),
            websiteUrl = channel.websiteUrl.orEmpty(),
            socials = channel.socials,
            contactEmail = channel.contactEmail.orEmpty(),
        )
    }
}

/** A folder (channelPlaylist) form draft. `category` is exactly one, required (D5). */
data class PlaylistDraft(
    val title: String = "",
    val category: String = "",
    val description: String = "",
    val tags: List<String> = emptyList(),
    val sortOrder: Int? = null,
) {
    val isValid: Boolean get() = title.isNotBlank() && category.isNotBlank()
}

/** An episode (channelAudio) metadata form draft. `category` is exactly one, required (D5). */
data class EpisodeDraft(
    val title: String = "",
    val category: String = "",
    val tags: List<String> = emptyList(),
    val description: String = "",
    val author: String = "",
    val narrator: String = "",
    val isAudiobook: Boolean = false,
    val languageCode: String? = null,
    val artworkUrl: String? = null,
    val position: Int? = null,
) {
    val isValid: Boolean get() = title.isNotBlank() && category.isNotBlank()
}

/** Trims and drops blanks from a comma/whitespace-separated tag or category input. */
fun parseTagList(raw: String): List<String> =
    raw.split(',', '\n')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .distinct()

