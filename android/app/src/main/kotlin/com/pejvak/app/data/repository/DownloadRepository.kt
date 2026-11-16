package com.pejvak.app.data.repository

import com.pejvak.app.data.local.DownloadFileDao
import com.pejvak.app.data.local.DownloadJobDao
import com.pejvak.app.data.local.DownloadProgressRow
import com.pejvak.app.data.local.DownloadScopeDao
import com.pejvak.app.data.local.OnlineCollectionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.domain.DownloadFile
import com.pejvak.app.domain.DownloadJob
import com.pejvak.app.domain.DownloadJobState
import com.pejvak.app.domain.DownloadScope
import com.pejvak.app.domain.DownloadState
import com.pejvak.app.domain.OnlineCollection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The download queue and the copies it writes (mirrors the download half of
 * LocalDBService.ts). The queue is rows, so a kill costs one file and the next
 * launch resumes from the first row that is not done.
 */
@Singleton
class DownloadRepository @Inject constructor(
    private val jobDao: DownloadJobDao,
    private val scopeDao: DownloadScopeDao,
    private val fileDao: DownloadFileDao,
    private val collectionDao: OnlineCollectionDao,
    private val trackDao: TrackDao,
) {
    suspend fun downloadingCollections(): List<OnlineCollection> = withContext(Dispatchers.IO) {
        collectionDao.getDownloading().map { it.toDomain() }
    }

    suspend fun downloadingScopes(): List<DownloadScope> = withContext(Dispatchers.IO) {
        scopeDao.getDownloading().map { it.toDomain() }
    }

    suspend fun getScope(key: String): DownloadScope? = withContext(Dispatchers.IO) {
        scopeDao.getByKey(key)?.toDomain()
    }

    suspend fun upsertScope(scope: DownloadScope) = withContext(Dispatchers.IO) {
        scopeDao.upsert(scope.toEntity())
    }

    suspend fun setScopeState(key: String, state: DownloadState, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { scopeDao.setState(key, state.wire, now) }

    suspend fun deleteScope(key: String) = withContext(Dispatchers.IO) { scopeDao.delete(key) }

    suspend fun replaceJobs(jobs: List<DownloadJob>): List<DownloadJob> = withContext(Dispatchers.IO) {
        if (jobs.isEmpty()) return@withContext emptyList()
        val scopeKey = jobs.first().scopeKey ?: return@withContext emptyList()
        jobDao.deleteByScope(scopeKey)
        jobDao.insertAll(jobs.map { it.toEntity() })
        jobDao.getByScope(scopeKey).map { it.toDomain() }
    }

    suspend fun getJobs(scopeKey: String): List<DownloadJob> = withContext(Dispatchers.IO) {
        jobDao.getByScope(scopeKey).map { it.toDomain() }
    }

    suspend fun nextJob(scopeKey: String): DownloadJob? = withContext(Dispatchers.IO) {
        jobDao.getNext(scopeKey)?.toDomain()
    }

    suspend fun setJobState(
        id: String,
        state: DownloadJobState,
        error: String? = null,
        now: Long = System.currentTimeMillis(),
    ) = withContext(Dispatchers.IO) { jobDao.setState(id, state.wire, error, now) }

    suspend fun updateJobProgress(id: String, bytesDone: Long, bytesTotal: Long, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { jobDao.updateProgress(id, bytesDone.coerceAtLeast(0), bytesTotal.coerceAtLeast(0), now) }

    suspend fun incrementAttempts(id: String) = withContext(Dispatchers.IO) { jobDao.incrementAttempts(id) }

    suspend fun progress(scopeKey: String): DownloadProgressRow = withContext(Dispatchers.IO) {
        jobDao.progressForScope(scopeKey)
    }

    suspend fun cancelActive(scopeKey: String, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { jobDao.cancelActive(scopeKey, now) }

    suspend fun requeueFailed(scopeKey: String, now: Long = System.currentTimeMillis()): Int =
        withContext(Dispatchers.IO) { jobDao.requeueFailed(scopeKey, now) }

    suspend fun deleteJobs(scopeKey: String) = withContext(Dispatchers.IO) { jobDao.deleteByScope(scopeKey) }

    suspend fun files(scopeKey: String): List<DownloadFile> = withContext(Dispatchers.IO) {
        fileDao.getByScope(scopeKey).map { it.toDomain() }
    }

    suspend fun filePaths(scopeKey: String): List<String> = withContext(Dispatchers.IO) {
        fileDao.getByScope(scopeKey).map { it.file_path }
    }

    suspend fun recordFile(file: DownloadFile) = withContext(Dispatchers.IO) { fileDao.upsert(file.toEntity()) }

    /** Drops one scope's copies, then re-points every affected track at what survives. */
    suspend fun deleteFiles(scopeKey: String): List<String> = withContext(Dispatchers.IO) {
        val trackIds = fileDao.getTrackIdsByScope(scopeKey)
        fileDao.deleteByScope(scopeKey)
        trackIds.forEach { refreshTrackLocation(it) }
        trackIds
    }

    suspend fun markTrackDownloaded(
        trackId: String,
        fileUri: String,
        downloadPath: String,
        fileSizeBytes: Long,
        durationSec: Int,
        folderKey: String,
        folderName: String,
        trackNumber: Int,
        now: Long = System.currentTimeMillis(),
    ) = withContext(Dispatchers.IO) {
        trackDao.markDownloaded(
            id = trackId, fileUri = fileUri, downloadPath = downloadPath, at = now,
            sizeBytes = fileSizeBytes, durationSec = durationSec, folderKey = folderKey,
            folderName = folderName, trackNumber = trackNumber,
        )
    }

    /**
     * Where an online track's player should read from: collection copy first, then
     * the earliest series copy, then the stream. Local tracks are untouched.
     */
    suspend fun refreshTrackLocation(trackId: String) = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val best = fileDao.getBestForTrack(trackId)
        if (best != null) {
            trackDao.markDownloaded(
                id = trackId, fileUri = best.file_uri, downloadPath = best.file_path, at = now,
                sizeBytes = best.file_size_bytes, durationSec = best.duration_sec,
                folderKey = best.folder_key, folderName = best.folder_name,
                trackNumber = best.track_number,
            )
        } else {
            trackDao.revertToStream(trackId, now)
        }
    }

    suspend fun setCollectionState(key: String, state: DownloadState, now: Long = System.currentTimeMillis()) =
        withContext(Dispatchers.IO) { collectionDao.setDownloadState(key, state.wire, now) }
}
