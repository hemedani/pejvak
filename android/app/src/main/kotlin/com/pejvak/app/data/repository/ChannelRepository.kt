package com.pejvak.app.data.repository

import com.pejvak.app.BuildConfig
import com.pejvak.app.data.auth.AuthRepository
import com.pejvak.app.data.auth.AuthSession
import com.pejvak.app.data.local.ChannelAudioDao
import com.pejvak.app.data.local.ChannelDao
import com.pejvak.app.data.local.ChannelPlaylistDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.media.AudioInspectionService
import com.pejvak.app.data.media.ContentHashService
import com.pejvak.app.data.remote.LesanException
import com.pejvak.app.data.remote.channels.ChannelRemoteDataSource
import com.pejvak.app.data.remote.channels.ChannelUploadClient
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import com.pejvak.app.domain.DownloadState
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelDraft
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.PlaylistDraft
import com.pejvak.app.domain.channel.channelAudioToTrack
import com.pejvak.app.domain.channel.serverOriginFromBaseUrl
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** The outcome of a creator write: a value, or a non-blocking message to surface as a notice. */
sealed class ChannelOp<out T> {
    data class Ok<T>(val value: T) : ChannelOp<T>()
    data class Failed(val message: String) : ChannelOp<Nothing>()
}

/**
 * The channel read-cache repository (plan 07 CHAN-D03). It mirrors the online-collection
 * caching posture (prompt D2): the phone reads from Room, refreshes in the background,
 * and **never** pushes these rows — the listener is a consumer, not the owner.
 *
 * `isMine` is resolved from the session at pull time (the current user id against the
 * channel's creator) and inherited by that channel's folders/episodes; it is the only
 * device-derived column in the mirror. A network failure leaves the cache untouched and
 * surfaces as a result the caller turns into a non-blocking notice (prompt D9).
 */
@Singleton
class ChannelRepository @Inject constructor(
    private val remote: ChannelRemoteDataSource,
    private val channels: ChannelDao,
    private val playlists: ChannelPlaylistDao,
    private val audios: ChannelAudioDao,
    private val auth: AuthRepository,
    private val session: AuthSession,
    private val uploader: ChannelUploadClient,
    private val contentHash: ContentHashService,
    private val inspection: AudioInspectionService,
) {
    private val serverOrigin: String = serverOriginFromBaseUrl(BuildConfig.LESAN_BASE_URL)

    data class BrowseResult(
        val total: Int,
        val page: Int,
        val limit: Int,
        val error: String? = null,
    )

    data class DetailResult(
        val channel: Channel,
        val playlists: List<ChannelPlaylist>,
        val audios: List<ChannelAudio>,
        val fromCache: Boolean,
        val error: String? = null,
    )

    fun observeChannels(): Flow<List<Channel>> =
        channels.observeAll().map { rows -> rows.map { it.toDomain() } }

    /** Pulls one page of the public directory into the mirror; returns the paging envelope. */
    suspend fun refreshChannels(
        category: String? = null,
        q: String? = null,
        page: Int = 1,
        limit: Int = 50,
    ): BrowseResult = withContext(Dispatchers.IO) {
        val myId = currentUserId()
        val now = System.currentTimeMillis()
        try {
            val result = remote.listChannels(category, q, page, limit)
            val rows = result.rows.map { it.copy(isMine = isMine(it, myId), cachedAt = now) }
            channels.upsertAll(rows.map { it.toEntity() })
            BrowseResult(result.total, result.page, result.limit)
        } catch (error: Exception) {
            BrowseResult(total = 0, page = page, limit = limit, error = error.message)
        }
    }

    /** Opens a channel: fetch its page, mirror the channel + folders + newest episodes. */
    suspend fun loadChannel(
        slug: String? = null,
        channelId: String? = null,
        audioLimit: Int = 20,
    ): DetailResult = withContext(Dispatchers.IO) {
        val myId = currentUserId()
        val now = System.currentTimeMillis()
        try {
            val detail = remote.getChannel(slug, channelId, audioLimit)
            val mine = isMine(detail.channel, myId)
            val channel = detail.channel.copy(isMine = mine, cachedAt = now)
            channels.upsert(channel.toEntity())
            val folderRows = detail.playlists.map { it.copy(isMine = mine, cachedAt = now) }
            playlists.deleteByChannel(channel.serverId)
            playlists.upsertAll(folderRows.map { it.toEntity() })
            val audioRows = detail.audios.map { it.copy(isMine = mine, cachedAt = now) }
            audios.upsertAll(audioRows.map { it.toEntity() })
            DetailResult(channel, folderRows, audioRows, fromCache = false)
        } catch (error: Exception) {
            val cached = cachedChannel(slug, channelId)
            if (cached == null) {
                DetailResult(emptyChannel(), emptyList(), emptyList(), fromCache = false, error = error.message)
            } else {
                val cachedMine = isMine(cached, myId)
                val folders = playlists.getByChannel(cached.serverId).map { it.toDomain() }
                val eps = audios.getByChannel(cached.serverId).map { it.toDomain() }
                DetailResult(cached.copy(isMine = cachedMine), folders, eps, fromCache = true, error = error.message)
            }
        }
    }

    /** Episodes of one folder: refresh from the network, then read the mirror. */
    suspend fun refreshPlaylistAudios(channelId: String, playlistId: String): List<ChannelAudio> =
        withContext(Dispatchers.IO) {
            val myId = currentUserId()
            val now = System.currentTimeMillis()
            val channel = channels.getByServerId(channelId)?.toDomain()
            val mine = channel?.let { isMine(it, myId) } ?: false
            runCatching {
                val page = remote.listChannelAudios(channelId = channelId, playlistId = playlistId, limit = 200)
                audios.upsertAll(page.rows.map { it.copy(isMine = mine, cachedAt = now).toEntity() })
            }
            audios.getByPlaylist(playlistId).map { it.toDomain() }
        }

    suspend fun cachedChannel(slug: String?, channelId: String?): Channel? = withContext(Dispatchers.IO) {
        when {
            !channelId.isNullOrBlank() -> channels.getByServerId(channelId)?.toDomain()
            !slug.isNullOrBlank() -> channels.getBySlug(slug)?.toDomain()
            else -> null
        }
    }

    suspend fun cachedAudios(channelId: String): List<ChannelAudio> = withContext(Dispatchers.IO) {
        audios.getByChannel(channelId).map { it.toDomain() }
    }

    /**
     * Materialises an episode into the player's `Track` (prompt D1) — an `Online`-origin
     * row whose run is the `channel:` context key, resolved against the server origin.
     */
    suspend fun toTrack(audio: ChannelAudio, channelName: String): Track =
        channelAudioToTrack(audio, channelName, serverOrigin)

    /** The durable, origin-resolved stream URL for an episode (prompt D11). */
    fun streamUrl(audio: ChannelAudio): String =
        com.pejvak.app.domain.channel.resolveAudioUrl(audio.audioUrl, serverOrigin)

    // --- Creator surfaces (plan 07 A3) ---

    data class UploadProgress(val sent: Long, val total: Long)

    /** Own channels, newest first; mirrors the server so [observeMyChannels] renders offline. */
    suspend fun refreshMyChannels(): ChannelOp<List<Channel>> = withContext(Dispatchers.IO) {
        val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
        val now = System.currentTimeMillis()
        val myId = currentUserId()
        runCatching {
            val rows = remote.getMyChannels(token).map { it.copy(isMine = true, cachedAt = now) }
            channels.upsertAll(rows.map { it.toEntity() })
            // Drop owned rows the server no longer returns (deleted elsewhere).
            val live = rows.map { it.serverId }.toSet()
            channels.getAll().filter { it.isMine && it.serverId !in live }
                .forEach { channels.deleteByServerId(it.serverId) }
            ChannelOp.Ok(rows.map { it.copy(isMine = isMine(it, myId)) })
        }.getOrElse { ChannelOp.Failed(messageOf(it)) }
    }

    fun observeMyChannels(): Flow<List<Channel>> =
        channels.observeAll().map { rows -> rows.filter { it.isMine }.map { it.toDomain() } }

    suspend fun createChannel(draft: ChannelDraft): ChannelOp<Channel> = withContext(Dispatchers.IO) {
        val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
        if (!draft.isValid) return@withContext ChannelOp.Failed("A channel needs a name and at least one category.")
        runCatching {
            val created = remote.createChannel(token, draft)
                .copy(isMine = true, cachedAt = System.currentTimeMillis())
            channels.upsert(created.toEntity())
            ChannelOp.Ok(created)
        }.getOrElse { ChannelOp.Failed(messageOf(it)) }
    }

    suspend fun updateChannel(channelId: String, draft: ChannelDraft): ChannelOp<Channel> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            if (!draft.isValid) return@withContext ChannelOp.Failed("A channel needs a name and at least one category.")
            runCatching {
                val existing = channels.getByServerId(channelId)?.toDomain()
                val updated = remote.updateChannel(token, channelId, draft)
                    .copy(isMine = true, cachedAt = System.currentTimeMillis())
                    .let { if (existing != null) it.copy(slug = it.slug.ifBlank { existing.slug }) else it }
                channels.upsert(updated.toEntity())
                ChannelOp.Ok(updated)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun deleteChannel(channelId: String): ChannelOp<Unit> = withContext(Dispatchers.IO) {
        val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
        runCatching {
            remote.deleteChannel(token, channelId)
            playlists.deleteByChannel(channelId)
            audios.deleteByChannel(channelId)
            channels.deleteByServerId(channelId)
            ChannelOp.Ok(Unit)
        }.getOrElse { ChannelOp.Failed(messageOf(it)) }
    }

    suspend fun createPlaylist(channelId: String, draft: PlaylistDraft): ChannelOp<ChannelPlaylist> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            if (!draft.isValid) return@withContext ChannelOp.Failed("A folder needs a title and a category.")
            runCatching {
                val created = remote.createPlaylist(token, channelId, draft)
                    .copy(isMine = true, cachedAt = System.currentTimeMillis())
                playlists.upsertAll(listOf(created.toEntity()))
                bumpChannelCounts(channelId)
                ChannelOp.Ok(created)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun updatePlaylist(playlistId: String, channelId: String, draft: PlaylistDraft): ChannelOp<ChannelPlaylist> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            runCatching {
                val updated = remote.updatePlaylist(token, playlistId, channelId, draft)
                    .copy(isMine = true, cachedAt = System.currentTimeMillis())
                playlists.upsertAll(listOf(updated.toEntity()))
                ChannelOp.Ok(updated)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun deletePlaylist(playlistId: String, channelId: String): ChannelOp<Unit> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            runCatching {
                remote.deletePlaylist(token, playlistId)
                val removed = playlists.getByServerId(playlistId)?.toDomain()
                if (removed != null) {
                    audios.getByChannel(channelId).filter { it.playlistServerId == playlistId }
                        .forEach { audios.deleteByServerId(it.serverId) }
                    playlists.deleteByServerId(playlistId)
                }
                bumpChannelCounts(channelId)
                ChannelOp.Ok(Unit)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun updateEpisode(audioId: String, channelId: String, draft: EpisodeDraft): ChannelOp<ChannelAudio> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            runCatching {
                val updated = remote.updateAudio(token, audioId, channelId, draft)
                    .copy(isMine = true, cachedAt = System.currentTimeMillis(), channelServerId = channelId)
                audios.upsert(updated.toEntity())
                ChannelOp.Ok(updated)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun moveEpisode(audioId: String, targetPlaylistId: String, channelId: String): ChannelOp<Unit> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            runCatching {
                remote.moveAudio(token, audioId, targetPlaylistId, null)
                val moved = audios.getByServerId(audioId)?.toDomain()
                if (moved != null) {
                    audios.upsert(moved.copy(playlistServerId = targetPlaylistId, channelServerId = channelId).toEntity())
                }
                ChannelOp.Ok(Unit)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    suspend fun deleteEpisode(audioId: String, channelId: String): ChannelOp<Unit> =
        withContext(Dispatchers.IO) {
            val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
            runCatching {
                remote.deleteAudio(token, audioId)
                audios.deleteByServerId(audioId)
                bumpChannelCounts(channelId)
                ChannelOp.Ok(Unit)
            }.getOrElse { ChannelOp.Failed(messageOf(it)) }
        }

    /** Uploads an avatar/gallery image and returns its durable URL. */
    suspend fun uploadImage(
        uri: String,
        onProgress: (Long, Long) -> Unit = { _, _ -> },
    ): ChannelOp<String> = withContext(Dispatchers.IO) {
        val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
        runCatching {
            val result = uploader.uploadImage(uri, onProgress)
            ChannelOp.Ok(resolveAudioUrl(result.audioUrl))
        }.getOrElse { ChannelOp.Failed(messageOf(it)) }
    }

    /**
     * The full upload flow (C04): device-hash + duration the picked file, stream its bytes
     * to the multipart act, then `publishChannelAudio` with the durable URL plus the
     * device-computed identity (prompt D6/D7). A quota refusal (501) surfaces as a
     * [ChannelOp.Failed] the caller shows as a non-blocking upgrade notice.
     */
    suspend fun uploadAndPublish(
        playlistId: String,
        channelId: String,
        uri: String,
        draft: EpisodeDraft,
        onProgress: (UploadProgress) -> Unit = {},
    ): ChannelOp<ChannelAudio> = withContext(Dispatchers.IO) {
        val token = session.current() ?: return@withContext ChannelOp.Failed("Please sign in first.")
        if (!draft.isValid) return@withContext ChannelOp.Failed("An episode needs a title and a category.")
        runCatching {
            val hash = contentHash.computeFileContentHash(uri)
            val fileName = uri.substringAfterLast('/')
            val durationSec = runCatching {
                inspection.inspectAudioFile(uri, fileName, hash.fileSizeBytes).info.durationSec?.roundToInt() ?: 0
            }.getOrDefault(0)
            val uploaded = uploader.uploadAudio(uri) { sent, total -> onProgress(UploadProgress(sent, total)) }
            val published = remote.publishAudio(
                token = token,
                playlistId = playlistId,
                contentHash = hash.contentHash,
                audioUrl = resolveAudioUrl(uploaded.audioUrl),
                mediaPath = uploaded.mediaPath,
                mimeType = uploaded.mimeType,
                fileSizeBytes = uploaded.fileSizeBytes,
                durationSec = durationSec,
                draft = draft,
            ).copy(isMine = true, channelServerId = channelId, cachedAt = System.currentTimeMillis())
            audios.upsert(published.toEntity())
            bumpChannelCounts(channelId)
            ChannelOp.Ok(published)
        }.getOrElse { ChannelOp.Failed(messageOf(it)) }
    }

    private fun resolveAudioUrl(audioUrl: String) = com.pejvak.app.domain.channel.resolveAudioUrl(audioUrl, serverOrigin)

    /** Recomputes a channel's informational counts from its mirrored folders/episodes. */
    private suspend fun bumpChannelCounts(channelId: String) {
        val channel = channels.getByServerId(channelId)?.toDomain() ?: return
        val folderCount = playlists.getByChannel(channelId).size
        val audioCount = audios.getByChannel(channelId).size
        channels.upsert(channel.copy(playlistCount = folderCount, audioCount = audioCount).toEntity())
    }

    private fun messageOf(error: Throwable): String = when (error) {
        is LesanException -> serverMessage(error.details) ?: error.message ?: "The request was refused."
        is ChannelUploadClient.ChannelUploadException -> error.message ?: "The upload failed."
        else -> error.message ?: "Something went wrong."
    }

    /** A 501 refusal is `{ success:false, body.message }`; `details` carries that body. */
    private fun serverMessage(details: Any?): String? {
        val obj = details as? JsonObject ?: return null
        return (obj["message"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
    }

    private suspend fun currentUserId(): String? = auth.getCachedUser()?.id

    private fun isMine(channel: Channel, myId: String?): Boolean =
        myId != null && channel.creatorId != null && channel.creatorId == myId

    private fun emptyChannel(): Channel = Channel(
        serverId = "", slug = "", name = "", status = com.pejvak.app.domain.channel.ChannelStatus.Active,
        cachedAt = 0L,
    )

    /** Marks a mirror row's download state after a download (plan §5, CHAN-U05 hook). */
    suspend fun setAudioDownloadState(audioServerId: String, state: DownloadState) = withContext(Dispatchers.IO) {
        val existing = audios.getByServerId(audioServerId)?.toDomain() ?: return@withContext
        audios.upsert(existing.copy(downloadState = state).toEntity())
    }
}
