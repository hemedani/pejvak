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
import com.pejvak.app.data.media.WaveformAnalyzer
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
import com.pejvak.app.domain.wireWaveform
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
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
    @dagger.hilt.android.qualifiers.ApplicationContext private val appContext: android.content.Context,
    private val remote: ChannelRemoteDataSource,
    private val channels: ChannelDao,
    private val playlists: ChannelPlaylistDao,
    private val audios: ChannelAudioDao,
    private val auth: AuthRepository,
    private val session: AuthSession,
    private val uploader: ChannelUploadClient,
    private val contentHash: ContentHashService,
    private val inspection: AudioInspectionService,
    private val waveforms: WaveformAnalyzer,
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

    /** The mirrored episode cache, newest first (Discover's creator shelf, plan 08 UX-D01). */
    fun observeAudios(): Flow<List<ChannelAudio>> =
        audios.observeAll().map { rows -> rows.map { it.toDomain() } }

    /** Channels already mirrored on this device (used to scope the Discover episode pull). */
    suspend fun cachedChannels(): List<Channel> = withContext(Dispatchers.IO) {
        channels.getAll().map { it.toDomain() }
    }

    /**
     * Pulls a bounded, newest-first slice of episodes from each mirrored channel that
     * serves [languageCode], so Discover can show "From creators" above the online
     * source directory (plan 08 UX-D01). Anonymous reads; a failure leaves the cache
     * untouched and never blocks the screen.
     */
    suspend fun refreshDiscoverAudios(
        languageCode: String?,
        maxChannels: Int = 12,
        perChannel: Int = 6,
    ): Unit = withContext(Dispatchers.IO) {
        val myId = currentUserId()
        val now = System.currentTimeMillis()
        channels.getAll()
            .map { it.toDomain() }
            .filter { com.pejvak.app.domain.channel.channelIsPublic(it) && (languageCode == null || it.languageCode == languageCode) }
            .sortedByDescending { it.cachedAt }
            .take(maxChannels)
            .forEach { channel ->
                runCatching {
                    val page = remote.listChannelAudios(channelId = channel.serverId, limit = perChannel)
                    rememberWaveforms(page.rows)
                    val mine = isMine(channel, myId)
                    audios.upsertAll(page.rows.map { it.copy(isMine = mine, cachedAt = now).toEntity() })
                }
            }
    }

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
            rememberWaveforms(audioRows)
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
                rememberWaveforms(page.rows)
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
     * A downloaded episode plays from its local file (U05); the stream URL stays on the
     * row so deleting the download falls back to streaming with no second code path.
     */
    suspend fun toTrack(audio: ChannelAudio, channelName: String): Track =
        channelAudioToTrack(audio, channelName, serverOrigin, localFileUri(audio))
            .also { waveforms.provide(audio.contentHash, wireWaveform(audio.waveform)) }

    /**
     * Keeps the server-measured strips. `waveform` is derived, not identity, so it is
     * not stored in the Room mirror; seed it from the wire rows before they are cached
     * and write it to the contentHash-keyed disk cache so it survives restart/offline.
     */
    private fun rememberWaveforms(rows: List<ChannelAudio>) {
        rows.forEach { waveforms.provide(it.contentHash, wireWaveform(it.waveform), persist = true) }
    }

    /** The durable, origin-resolved stream URL for an episode (prompt D11). */
    fun streamUrl(audio: ChannelAudio): String =
        com.pejvak.app.domain.channel.resolveAudioUrl(audio.audioUrl, serverOrigin)

    /** The `file://` URI of a downloaded episode, or null when it is not on disk (U05). */
    fun localFileUri(audio: ChannelAudio): String? {
        val path = audio.localPath ?: return null
        val file = java.io.File(path)
        return if (file.exists()) file.toURI().toString() else null
    }

    // --- Offline download for a single channel episode (plan 07 CHAN-U05) ---

    data class EpisodeDownloadProgress(val sent: Long, val total: Long)

    private val activeDownloads = java.util.concurrent.ConcurrentHashMap<String, java.net.HttpURLConnection>()
    private val cancelledDownloads = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    private fun channelFile(audio: ChannelAudio): java.io.File =
        java.io.File(
            java.io.File(appContext.filesDir, "Channels").apply { mkdirs() },
            com.pejvak.app.domain.channel.channelDownloadFileName(audio.contentHash, audio.mimeType),
        )

    /**
     * Downloads one episode's bytes to app storage, keyed on `contentHash`, atomically
     * (write to `.part`, verify the byte count, rename) so an interrupted transfer leaves
     * no half file — the same discipline the backend applies to uploads (D18). Marks the
     * mirror `downloading` → `complete` (with `local_path` + duration) or `failed`. A
     * network failure is a [ChannelOp.Failed] notice, never a crash.
     */
    suspend fun downloadEpisode(
        audio: ChannelAudio,
        onProgress: (EpisodeDownloadProgress) -> Unit = {},
    ): ChannelOp<ChannelAudio> = withContext(Dispatchers.IO) {
        val key = audio.contentHash
        if (activeDownloads.containsKey(key)) return@withContext ChannelOp.Failed("Already downloading this episode.")
        cancelledDownloads.remove(key)
        audios.setDownloadState(audio.serverId, DownloadState.Downloading.wire, audio.localPath)
        val url = resolveAudioUrl(audio.audioUrl)
        val dest = channelFile(audio)
        val partial = java.io.File(dest.parentFile, dest.name + ".part")
        val connection = try {
            (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 30_000
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
        } catch (error: Exception) {
            audios.setDownloadState(audio.serverId, DownloadState.Failed.wire, audio.localPath)
            return@withContext ChannelOp.Failed(error.message ?: "Could not reach the server.")
        }
        activeDownloads[key] = connection
        try {
            val total = connection.contentLengthLong
            dest.parentFile?.mkdirs()
            var written = 0L
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        if (key in cancelledDownloads) throw java.io.IOException("Cancelled")
                        kotlinx.coroutines.currentCoroutineContext()
                            .ensureActive()
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        written += read
                        onProgress(EpisodeDownloadProgress(written, if (total > 0) total else 0))
                    }
                }
            }
            if (total > 0 && written != total) throw java.io.IOException("Incomplete download.")
            if (dest.exists()) dest.delete()
            if (!partial.renameTo(dest)) {
                partial.copyTo(dest, overwrite = true)
                partial.delete()
            }
            val durationSec = runCatching {
                inspection.inspectAudioFile(dest.toURI().toString(), dest.name, written).info.durationSec?.roundToInt() ?: audio.durationSec
            }.getOrDefault(audio.durationSec)
            val updated = audio.copy(
                downloadState = DownloadState.Complete,
                localPath = dest.absolutePath,
                fileSizeBytes = if (written > 0) written else audio.fileSizeBytes,
                durationSec = if (durationSec > 0) durationSec else audio.durationSec,
            )
            audios.upsert(updated.toEntity())
            ChannelOp.Ok(updated)
        } catch (error: kotlinx.coroutines.CancellationException) {
            if (partial.exists()) partial.delete()
            audios.setDownloadState(audio.serverId, DownloadState.Cancelled.wire, audio.localPath)
            throw error
        } catch (error: Exception) {
            if (partial.exists()) partial.delete()
            val state = if (key in cancelledDownloads) DownloadState.Cancelled else DownloadState.Failed
            audios.setDownloadState(audio.serverId, state.wire, audio.localPath)
            cancelledDownloads.remove(key)
            ChannelOp.Failed(error.message ?: "The download failed.")
        } finally {
            activeDownloads.remove(key)
            connection.disconnect()
        }
    }

    /** Aborts an in-flight episode download (disconnect + unlink the `.part`). */
    fun cancelEpisodeDownload(audio: ChannelAudio) {
        val key = audio.contentHash
        cancelledDownloads.add(key)
        activeDownloads[key]?.disconnect()
    }

    /** Deletes a downloaded episode's file and clears its local state (U05). */
    suspend fun deleteEpisodeDownload(audio: ChannelAudio): ChannelOp<ChannelAudio> = withContext(Dispatchers.IO) {
        val path = audio.localPath
        if (!path.isNullOrBlank()) {
            runCatching { java.io.File(path).takeIf { it.exists() }?.delete() }
        }
        val updated = audio.copy(downloadState = DownloadState.None, localPath = null)
        audios.upsert(updated.toEntity())
        ChannelOp.Ok(updated)
    }

    /** Rows the app died with mid-download; the UI re-marks them so a relaunch can resume. */
    suspend fun interruptedDownloads(): List<ChannelAudio> = withContext(Dispatchers.IO) {
        audios.getDownloading().map { it.toDomain() }
    }

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
