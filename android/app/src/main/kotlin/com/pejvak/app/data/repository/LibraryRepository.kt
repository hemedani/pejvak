package com.pejvak.app.data.repository

import com.pejvak.app.data.local.AnnotationDao
import com.pejvak.app.data.local.FolderDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.data.media.ArtworkService
import com.pejvak.app.data.media.DeviceScanService
import com.pejvak.app.data.media.FileIo
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Folder
import com.pejvak.app.domain.LibraryEntry
import com.pejvak.app.domain.MissingTrack
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SessionSummary
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.TrackStats
import com.pejvak.app.domain.computeTrackStats
import com.pejvak.app.domain.mimeTypeForFileName
import com.pejvak.app.domain.resolveTrackMetadata
import com.pejvak.app.domain.summariseSessions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The only place a scan turns into rows (mirrors ImportService.ts + RelinkService.ts).
 * Everything imported is referenced in place — the track records the device's own
 * URI and no audio bytes are copied. contentHash is identity, so a moved file is
 * re-pointed (relinked) rather than duplicated, keeping its history and notes.
 */
@Singleton
class LibraryRepository @Inject constructor(
    private val trackDao: TrackDao,
    private val folderDao: FolderDao,
    private val sessionDao: SessionDao,
    private val annotationDao: AnnotationDao,
    private val fileIo: FileIo,
    private val artworkService: ArtworkService,
) {
    data class ImportOutcome(
        val imported: List<Track>,
        val duplicates: Int,
        val relinked: Int,
        val failed: Int,
    )

    /** The slice of the library the scan planner compares against. */
    suspend fun loadLibraryIndex(): List<LibraryEntry> = withContext(Dispatchers.IO) {
        trackDao.getAll().map { track ->
            LibraryEntry(
                contentHash = track.content_hash,
                sourceUri = track.source_uri,
                sourceSize = track.source_size,
                sourceMtime = track.source_mtime,
                title = track.title,
                durationSec = track.duration_sec,
                availability = Availability.from(track.availability),
            )
        }
    }

    /**
     * Which recorded locations no longer resolve. Only rows a discovered file could
     * match are ever candidates for relinking, so the caller passes the narrowed
     * set from libraryEntriesToVerify. Without this, a moved file reads as a
     * duplicate of itself and is skipped.
     */
    suspend fun findGoneLocations(entries: List<LibraryEntry>): Set<String> = withContext(Dispatchers.IO) {
        val gone = mutableSetOf<String>()
        for (entry in entries) {
            val uri = entry.sourceUri
            if (uri != null && !fileIo.isReachable(uri)) gone.add(uri)
        }
        gone
    }

    suspend fun importIdentifiedFiles(
        files: List<DeviceScanService.IdentifiedFile>,
        grants: List<DeviceScanService.FolderGrant> = emptyList(),
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
    ): ImportOutcome = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        for (grant in grants) {
            try {
                folderDao.upsert(
                    Folder(key = grant.folderKey, name = grant.folderName, treeUri = grant.treeUri, addedAt = now).toEntity(),
                )
            } catch (_: Exception) {
                // A grant that cannot be persisted must not fail the import.
            }
        }

        val imported = mutableListOf<Track>()
        var duplicates = 0
        var relinked = 0
        var failed = 0
        var done = 0

        for (entry in files) {
            try {
                val existing = trackDao.getByContentHash(entry.contentHash)?.toDomain()
                val recordedUri = existing?.let { it.fileUri ?: it.sourceUri }
                // availability is only set by something that already looked; a
                // rescan cannot see an absence. Checking the location here is what
                // makes a moved folder relinkable instead of silently skipped.
                val movedToANewLocation = existing != null &&
                    existing.availability != Availability.Missing &&
                    recordedUri != null &&
                    recordedUri != entry.file.uri &&
                    !fileIo.isReachable(recordedUri)

                if (existing != null && (existing.availability == Availability.Missing || movedToANewLocation)) {
                    // The same content, previously gone: re-point the existing row so
                    // its sessions and annotations survive.
                    trackDao.updateLocation(
                        id = existing.id,
                        sourceUri = entry.file.uri,
                        sourcePath = entry.file.path,
                        sourceSize = entry.fileSizeBytes,
                        sourceMtime = entry.file.modifiedAt,
                        folderKey = entry.file.folderKey,
                        folderName = entry.file.folderName,
                        at = System.currentTimeMillis(),
                    )
                    runCatching { artworkService.saveImportedArtwork(existing.id, entry.picture, entry.tagTruncated) }
                    relinked += 1
                } else if (existing != null) {
                    // The hash is the authority on identity; the row's own location
                    // still resolves, so this really is a second copy.
                    duplicates += 1
                } else {
                    // Captured before the insert, or this would find the row we just wrote.
                    val previous = trackDao.getBySourceUri(entry.file.uri)?.toDomain()
                    val metadata = resolveTrackMetadata(entry.file.fileName, entry.file.durationSec, entry.tags)
                    val track = Track(
                        id = UUID.randomUUID().toString(),
                        contentHash = entry.contentHash,
                        title = metadata.title,
                        fileName = entry.file.fileName,
                        fileUri = entry.file.uri,
                        durationSec = entry.file.durationSec,
                        fileSizeBytes = entry.fileSizeBytes,
                        mimeType = mimeTypeForFileName(entry.file.fileName),
                        isAudiobook = metadata.isAudiobook,
                        author = metadata.author,
                        album = metadata.album,
                        trackNumber = metadata.trackNumber,
                        discNumber = metadata.discNumber,
                        year = metadata.year,
                        syncStatus = SyncStatus.Pending,
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis(),
                        source = entry.file.source,
                        sourceUri = entry.file.uri,
                        sourcePath = entry.file.path,
                        sourceSize = entry.fileSizeBytes,
                        sourceMtime = entry.file.modifiedAt,
                        folderKey = entry.file.folderKey,
                        folderName = entry.file.folderName,
                        origin = Origin.Local,
                    )
                    trackDao.upsert(track.toEntity())
                    imported.add(track)

                    // The cover came out of the hash buffer, so it costs no extra read.
                    // It must never fail an import.
                    runCatching { artworkService.saveImportedArtwork(track.id, entry.picture, entry.tagTruncated) }

                    if (previous != null && previous.contentHash != entry.contentHash) {
                        // The file was replaced since we last saw it; the old row's
                        // history is real but it must stop presenting as playable.
                        trackDao.setAvailability(previous.id, Availability.Missing.wire)
                    }
                }
            } catch (_: Exception) {
                failed += 1
            }
            done += 1
            onProgress(done, files.size)
        }

        // The caller (ImportViewModel) enqueues a sync once the outcome is known;
        // the repository stays a pure persistence boundary.
        ImportOutcome(imported, duplicates, relinked, failed)
    }

    /** Live note counts for a set of tracks, keyed by track id. */
    suspend fun annotationCounts(trackIds: List<String>): Map<String, Int> =
        withContext(Dispatchers.IO) {
            if (trackIds.isEmpty()) return@withContext emptyMap()
            annotationDao.countsForTracks(trackIds).associate { it.track_id to it.noteCount }
        }

    // --- Library browsing ---

    fun observeTracks(): Flow<List<Track>> =
        trackDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    fun observeFolders(): Flow<List<Folder>> =
        folderDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    fun observeSessions(): Flow<List<Session>> =
        sessionDao.observeLive().map { rows -> rows.map { it.toDomain() } }

    fun observeAnnotations(): Flow<List<Annotation>> =
        annotationDao.observeLive().map { rows -> rows.map { it.toDomain() } }

    suspend fun tracksInFolder(folderKey: String): List<Track> = withContext(Dispatchers.IO) {
        trackDao.getByFolderKey(folderKey).map { it.toDomain() }
    }

    suspend fun track(id: String): Track? = withContext(Dispatchers.IO) {
        trackDao.getById(id)?.toDomain()
    }

    suspend fun allTracks(): List<Track> = withContext(Dispatchers.IO) {
        trackDao.getAll().map { it.toDomain() }
    }

    suspend fun sessionsForTrack(trackId: String): List<Session> = withContext(Dispatchers.IO) {
        sessionDao.getForTrack(trackId).map { it.toDomain() }
    }

    suspend fun allSessions(): List<Session> = withContext(Dispatchers.IO) {
        sessionDao.getLive().map { it.toDomain() }
    }

    // --- Missing files (RelinkService) ---

    /** Every track whose file is gone, with what is recorded against it. */
    suspend fun listMissing(): List<MissingTrack> = withContext(Dispatchers.IO) {
        val tracks = trackDao.getByAvailability(Availability.Missing.wire).map { it.toDomain() }
        if (tracks.isEmpty()) return@withContext emptyList()
        val ids = tracks.map { it.id }
        val activity = sessionDao.activityCounts(ids).associateBy { it.track_id }
        val notes = annotationDao.countsForTracks(ids).associateBy { it.track_id }
        tracks.map { track ->
            MissingTrack(
                track = track,
                sessionCount = activity[track.id]?.sessionCount ?: 0,
                listenedSec = activity[track.id]?.listenedSec ?: 0,
                annotationCount = notes[track.id]?.noteCount ?: 0,
            )
        }
    }

    // --- Track detail stats ---

    suspend fun trackStats(trackId: String): TrackStats = withContext(Dispatchers.IO) {
        val sessions = sessionDao.getForTrack(trackId).map { it.toDomain() }
        val annotations = annotationDao.getForTrack(trackId).map { it.toDomain() }
        computeTrackStats(sessions, annotations)
    }

    suspend fun sessionSummary(trackId: String): SessionSummary = withContext(Dispatchers.IO) {
        summariseSessions(sessionDao.getForTrack(trackId).map { it.toDomain() })
    }

    suspend fun getTrack(id: String): Track? = trackDao.getById(id)?.toDomain()

    suspend fun getTracks(ids: List<String>): List<Track> = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext emptyList()
        val byId = trackDao.getByIds(ids.distinct()).associate { it.id to it.toDomain() }
        ids.mapNotNull { byId[it] }
    }

    suspend fun firstPlayable(): Track? = withContext(Dispatchers.IO) {
        trackDao.getAll()
            .firstOrNull { it.file_uri != null && it.availability != Availability.Missing.wire }
            ?.toDomain()
    }

    suspend fun setAvailability(id: String, availability: Availability) =
        trackDao.setAvailability(id, availability.wire)
}