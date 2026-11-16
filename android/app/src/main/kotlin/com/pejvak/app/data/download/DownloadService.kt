package com.pejvak.app.data.download

import android.content.Context
import com.pejvak.app.data.media.AudioInspectionService
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.DownloadRepository
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.data.repository.OnlineCollectionRepository
import com.pejvak.app.domain.DownloadFile
import com.pejvak.app.domain.DownloadJob
import com.pejvak.app.domain.DownloadJobState
import com.pejvak.app.domain.DownloadScope
import com.pejvak.app.domain.DownloadScopeKind
import com.pejvak.app.domain.DownloadState
import com.pejvak.app.domain.ProgressSample
import com.pejvak.app.domain.ProgressWrite
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.collectionFolderKey
import com.pejvak.app.domain.collectionRelativePath
import com.pejvak.app.domain.seriesFolderKey
import com.pejvak.app.domain.seriesRelativePath
import com.pejvak.app.domain.seriesScopeKey
import com.pejvak.app.domain.seriesSeedOf
import com.pejvak.app.domain.trackFileName
import com.pejvak.app.domain.shouldWriteProgress
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class DownloadSummary(
    val scopeKey: String,
    val total: Int = 0,
    val done: Int = 0,
    val failed: Int = 0,
    val bytesDone: Long = 0,
    val bytesTotal: Long = 0,
    val state: DownloadState = DownloadState.None,
    val running: Boolean = false,
) {
    val percent: Int get() = if (bytesTotal > 0) ((bytesDone * 100) / bytesTotal).toInt().coerceIn(0, 100) else 0
}

/**
 * Downloading a collection onto the device (mirrors mobile/src/services/DownloadService.ts).
 *
 * The queue is rows, one file at a time: a kill costs the file in flight and the
 * next launch resumes from the first row that is not done. Files land under
 * `filesDir/Online/<source>/…`, and a finished file is what gives its track a
 * folder key — an interrupted course still shows the lectures that arrived.
 */
@Singleton
class DownloadService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repo: DownloadRepository,
    private val collections: OnlineCollectionRepository,
    private val catalog: OnlineCatalogService,
    private val inspection: AudioInspectionService,
    private val registry: OnlineRegistry,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    private val cancelled = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    @Volatile private var activeConnection: HttpURLConnection? = null
    private var running = false

    private val _changes = MutableStateFlow(0L)
    val changes: StateFlow<Long> = _changes.asStateFlow()

    fun isLive(sourceId: String?): Boolean = sourceId != null && registry.source(sourceId)?.live == true

    suspend fun summary(scopeKey: String): DownloadSummary = withContext(Dispatchers.IO) {
        val progress = repo.progress(scopeKey)
        val series = repo.getScope(scopeKey)
        val collection = collections.get(scopeKey)
        val state = series?.downloadState ?: collection?.downloadState
            ?: if (progress.total == 0) DownloadState.None else DownloadState.Downloading
        DownloadSummary(
            scopeKey = scopeKey,
            total = progress.total,
            done = progress.done,
            failed = progress.failed,
            bytesDone = progress.bytesDone,
            bytesTotal = progress.bytesTotal,
            state = state,
            running = running,
        )
    }

    suspend fun startDownload(collectionKey: String) {
        val meta = collections.get(collectionKey) ?: throw IllegalStateException("Save this collection before downloading it.")
        if (isLive(meta.sourceId)) throw IllegalStateException("Live radio cannot be downloaded.")
        if (meta.downloadState == DownloadState.Downloading) return
        val tracks = catalog.tracksForCollection(collectionKey)
        if (tracks.isEmpty()) throw IllegalStateException("There is nothing to download in this collection yet.")
        startScope(
            DownloadScope(
                key = meta.key,
                collectionKey = meta.key,
                kind = DownloadScopeKind.Collection,
                title = meta.title,
                createdAt = System.currentTimeMillis(),
                updatedAt = System.currentTimeMillis(),
            ),
            meta.key,
            meta.sourceId,
            meta.externalId,
            meta.title,
            tracks.mapIndexed { index, track -> track to (track.trackNumber ?: index + 1) },
        )
    }

    suspend fun startSeriesDownload(
        collectionKey: String,
        title: String,
        seriesKey: String,
        trackIds: List<String>,
    ) {
        val meta = collections.get(collectionKey) ?: throw IllegalStateException("Save this collection before downloading it.")
        if (isLive(meta.sourceId)) throw IllegalStateException("Live radio cannot be downloaded.")
        val byId = catalog.tracksForCollection(collectionKey).associateBy { it.id }
        val selected = trackIds.mapNotNull { byId[it] }
        if (selected.isEmpty()) throw IllegalStateException("There is nothing to download in this series yet.")
        val seed = selected.first().externalId ?: selected.first().id
        val scopeKey = seriesScopeKey(collectionKey, seed)
        if (repo.getScope(scopeKey)?.downloadState == DownloadState.Downloading) return
        val now = System.currentTimeMillis()
        repo.upsertScope(
            DownloadScope(
                key = scopeKey,
                collectionKey = collectionKey,
                kind = DownloadScopeKind.Series,
                title = title,
                seriesKey = seriesKey,
                createdAt = now,
                updatedAt = now,
            ),
        )
        startScope(
            repo.getScope(scopeKey) ?: return,
            collectionKey,
            meta.sourceId,
            meta.externalId,
            meta.title,
            selected.mapIndexed { index, track -> track to (index + 1) },
        )
    }

    private suspend fun startScope(
        scope: DownloadScope,
        collectionKey: String,
        sourceId: String,
        collectionExternalId: String,
        collectionTitle: String,
        items: List<Pair<Track, Int>>,
    ) {
        val fresh = catalog.resolveStreamUrls(collectionKey).associateBy { it.externalId }
        val directory = scopeDirectory(scope, sourceId, collectionTitle, collectionExternalId)
        directory.mkdirs()
        val already = repo.files(scope.key).map { it.trackId }.toSet()
        val now = System.currentTimeMillis()
        val jobs = items.mapNotNull { (track, order) ->
            val remote = track.externalId?.let { fresh[it] }
            val url = remote?.streamUrl ?: track.streamUrl ?: return@mapNotNull null
            val title = remote?.title ?: track.title
            DownloadJob(
                id = UUID.randomUUID().toString(),
                collectionKey = collectionKey,
                scopeKey = scope.key,
                trackId = track.id,
                externalId = track.externalId ?: track.id,
                title = title,
                orderIndex = order,
                url = url,
                destPath = File(directory, trackFileName(order, title, url)).absolutePath,
                createdAt = now,
                updatedAt = now,
            )
        }
        if (jobs.isEmpty()) {
            throw IllegalStateException(
                if (scope.kind == DownloadScopeKind.Series) "This series has no playable audio to download."
                else "This collection has no playable audio to download.",
            )
        }
        cancelled.remove(scope.key)
        val queued = repo.replaceJobs(jobs)
        for (job in queued) {
            if (job.trackId in already) repo.setJobState(job.id, DownloadJobState.Done)
        }
        setScopeState(scope.key, DownloadState.Downloading)
        emit()
        pump()
    }

    suspend fun cancel(scopeKey: String) {
        cancelled.add(scopeKey)
        activeConnection?.disconnect()
        repo.cancelActive(scopeKey)
        setScopeState(scopeKey, DownloadState.Cancelled)
        emit()
    }

    suspend fun retry(scopeKey: String) {
        val requeued = repo.requeueFailed(scopeKey)
        if (requeued == 0) return
        cancelled.remove(scopeKey)
        setScopeState(scopeKey, DownloadState.Downloading)
        emit()
        pump()
    }

    /**
     * Delete a scope's audio, keeping every row. The paths come from
     * `download_files`, never recomputed from a title that may have changed.
     */
    suspend fun delete(scopeKey: String) {
        val series = repo.getScope(scopeKey)
        val collectionKey = series?.collectionKey ?: scopeKey
        val meta = collections.get(collectionKey)
        cancelled.add(scopeKey)
        activeConnection?.disconnect()
        awaitIdle()

        val paths = repo.filePaths(scopeKey)
        repo.deleteFiles(scopeKey)
        repo.deleteJobs(scopeKey)
        for (path in paths) removeFile(path)

        if (series != null) {
            val seed = seriesSeedOf(scopeKey)
            if (meta != null && seed != null) {
                removeDirectory(scopeDirectory(series, meta.sourceId, meta.title, meta.externalId))
            }
            repo.deleteScope(scopeKey)
        } else {
            if (meta != null) {
                removeDirectory(scopeDirectoryForCollection(meta.sourceId, meta.title, meta.externalId))
            }
            repo.setCollectionState(scopeKey, DownloadState.None)
        }
        emit()
    }

    /** Turns "the app died at 12 of 29" back into a running queue. Safe on every launch. */
    fun resumeInterrupted() {
        scope.launch {
            if (repo.downloadingCollections().isEmpty() && repo.downloadingScopes().isEmpty()) return@launch
            pump()
        }
    }

    private suspend fun pump() = mutex.withLock {
        if (running) return@withLock
        running = true
        emit()
        try {
            while (true) {
                val collection = repo.downloadingCollections().firstOrNull()
                val series = repo.downloadingScopes().firstOrNull()
                val scope = when {
                    collection != null -> DownloadScope(
                        key = collection.key,
                        collectionKey = collection.key,
                        kind = DownloadScopeKind.Collection,
                        title = collection.title,
                        createdAt = collection.createdAt,
                        updatedAt = collection.updatedAt,
                    )
                    series != null -> series
                    else -> null
                } ?: break
                if (scope.key in cancelled) {
                    setScopeState(scope.key, DownloadState.Cancelled)
                    continue
                }
                val job = repo.nextJob(scope.key)
                if (job == null) {
                    finalizeScope(scope.key)
                    continue
                }
                runJob(job, scope)
                emit()
            }
        } finally {
            running = false
            emit()
        }
    }

    private suspend fun finalizeScope(scopeKey: String) {
        val progress = repo.progress(scopeKey)
        if (progress.total == 0) {
            setScopeState(scopeKey, DownloadState.None)
            return
        }
        val incomplete = progress.failed > 0 || progress.done < progress.total
        setScopeState(scopeKey, if (incomplete) DownloadState.Failed else DownloadState.Complete)
    }

    private suspend fun runJob(job: DownloadJob, scope: DownloadScope) {
        var previousWrite: ProgressWrite? = null
        var latest = ProgressSample(0, 0)
        for (attempt in 1..MAX_ATTEMPTS) {
            if (scope.key in cancelled) {
                repo.setJobState(job.id, DownloadJobState.Cancelled)
                return
            }
            repo.setJobState(job.id, DownloadJobState.Running)
            try {
                val written = download(job.url, File(job.destPath)) { done, total ->
                    val sample = ProgressSample(done, total)
                    latest = sample
                    val now = System.currentTimeMillis()
                    if (shouldWriteProgress(previousWrite, sample, now)) {
                        previousWrite = ProgressWrite(sample, now)
                        repo.updateJobProgress(job.id, done, total, now)
                        emit()
                    }
                }
                if (written > 0) latest = ProgressSample(written, maxOf(latest.totalBytes, written))
                finishTrack(job, scope, written)
                repo.setJobState(job.id, DownloadJobState.Done)
                return
            } catch (cancelledError: CancellationException) {
                if (scope.key in cancelled) {
                    repo.setJobState(job.id, DownloadJobState.Cancelled)
                    return
                }
                throw cancelledError
            } catch (error: Exception) {
                if (scope.key in cancelled) {
                    repo.setJobState(job.id, DownloadJobState.Cancelled)
                    return
                }
                repo.incrementAttempts(job.id)
                if (attempt == MAX_ATTEMPTS) {
                    repo.setJobState(job.id, DownloadJobState.Failed, error.message)
                    return
                }
                delay(BACKOFF_MS.getOrElse(attempt - 1) { 8_000L })
            } finally {
                if (latest.bytesWritten > 0) {
                    repo.updateJobProgress(job.id, latest.bytesWritten, latest.totalBytes)
                    emit()
                }
            }
        }
    }

    private suspend fun download(url: String, destination: File, onProgress: suspend (Long, Long) -> Unit): Long =
        withContext(Dispatchers.IO) {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 30_000
                instanceFollowRedirects = true
                requestMethod = "GET"
            }
            val partial = File(destination.parentFile, destination.name + ".part")
            activeConnection = connection
            try {
                val total = connection.contentLengthLong
                destination.parentFile?.mkdirs()
                var written = 0L
                connection.inputStream.use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            kotlinx.coroutines.currentCoroutineContext().ensureActive()
                            if (Thread.currentThread().isInterrupted) throw CancellationException("Cancelled")
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            written += read
                            onProgress(written, if (total > 0) total else 0)
                        }
                    }
                }
                if (destination.exists()) destination.delete()
                if (!partial.renameTo(destination)) {
                    partial.copyTo(destination, overwrite = true)
                    partial.delete()
                }
                written
            } finally {
                activeConnection = null
                connection.disconnect()
                if (!destination.exists() && partial.exists()) partial.delete()
            }
        }

    private suspend fun finishTrack(job: DownloadJob, scope: DownloadScope, sizeBytes: Long) {
        val meta = collections.get(scope.collectionKey)
            ?: throw IllegalStateException("The collection was removed while it was downloading.")
        val file = File(job.destPath)
        var durationSec = 0
        try {
            durationSec = inspection.inspectAudioFile(
                uri = file.toURI().toString(),
                fileName = file.name,
                fileSizeBytes = sizeBytes,
            ).info.durationSec?.let { Math.round(it).toInt() } ?: 0
        } catch (_: Exception) {
            // A container we cannot read is still a playable file.
        }
        val folderKey = if (scope.kind == DownloadScopeKind.Series) {
            seriesFolderKey(meta.sourceId, meta.externalId, seriesSeedOf(scope.key) ?: job.externalId)
        } else {
            collectionFolderKey(meta.sourceId, meta.externalId)
        }
        val folderName = if (scope.kind == DownloadScopeKind.Series) scope.title else meta.title
        if (scope.kind == DownloadScopeKind.Collection) {
            repo.markTrackDownloaded(
                trackId = job.trackId,
                fileUri = file.toURI().toString(),
                downloadPath = job.destPath,
                fileSizeBytes = sizeBytes,
                durationSec = durationSec,
                folderKey = folderKey,
                folderName = folderName,
                trackNumber = job.orderIndex,
            )
        }
        repo.recordFile(
            DownloadFile(
                scopeKey = scope.key,
                scopeKind = scope.kind,
                trackId = job.trackId,
                fileUri = file.toURI().toString(),
                filePath = job.destPath,
                fileSizeBytes = sizeBytes,
                durationSec = durationSec,
                folderKey = folderKey,
                folderName = folderName,
                trackNumber = job.orderIndex,
                createdAt = System.currentTimeMillis(),
            ),
        )
        if (scope.kind == DownloadScopeKind.Series) repo.refreshTrackLocation(job.trackId)
    }

    private suspend fun setScopeState(scopeKey: String, state: DownloadState) {
        val series = repo.getScope(scopeKey)
        if (series != null) repo.setScopeState(scopeKey, state) else repo.setCollectionState(scopeKey, state)
    }

    private fun scopeDirectory(
        scope: DownloadScope,
        sourceId: String,
        collectionTitle: String,
        collectionExternalId: String,
    ): File {
        val seed = if (scope.kind == DownloadScopeKind.Series) seriesSeedOf(scope.key) else null
        val relative = if (seed != null) {
            seriesRelativePath(sourceId, collectionTitle, collectionExternalId, scope.title, seed)
        } else {
            collectionRelativePath(sourceId, collectionTitle, collectionExternalId)
        }
        return File(context.filesDir, relative)
    }

    private fun scopeDirectoryForCollection(sourceId: String, title: String, externalId: String): File =
        File(context.filesDir, collectionRelativePath(sourceId, title, externalId))

    private fun removeFile(path: String) {
        try {
            val file = File(path)
            if (file.exists()) file.delete()
        } catch (_: Exception) {
            // Gone either way, which is the point.
        }
    }

    /** Recursive delete, confined strictly below the app's own document directory. */
    private fun removeDirectory(directory: File) {
        try {
            if (!directory.exists()) return
            val root = context.filesDir.canonicalFile
            val target = directory.canonicalFile
            if (target == root || !target.path.startsWith(root.path + File.separator)) return
            target.deleteRecursively()
        } catch (_: Exception) {
            // A folder that will not delete is not a reason to fail the delete.
        }
    }

    private suspend fun awaitIdle() {
        while (running) delay(25)
    }

    private fun emit() {
        _changes.value = _changes.value + 1
    }

    private companion object {
        const val MAX_ATTEMPTS = 3
        val BACKOFF_MS = longArrayOf(2_000L, 8_000L)
    }
}
