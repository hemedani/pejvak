package com.pejvak.app.data.media

import android.content.Context
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.domain.EmbeddedPicture
import com.pejvak.app.domain.artworkExtension
import com.pejvak.app.domain.isStreamUri
import com.pejvak.app.domain.toHex
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cover art on disk (mirrors ArtworkService.ts). Audio is referenced in place, but
 * its artwork is extracted once and written beside the database: a picture inside
 * a 40 MB M4B cannot be handed to an image loader per list row.
 *
 * Stored under filesDir (not cache — the OS evicts cache without asking), named
 * after a hash of the picture (thirty chapters of one book share one file), and
 * failure is silent and local (no artwork = the gradient tile).
 */
@Singleton
class ArtworkService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val trackDao: TrackDao,
    private val inspectionService: AudioInspectionService,
) {
    data class BackfillOutcome(
        val scanned: Int,
        val found: Int,
        val empty: Int,
        val failed: Int,
        val skipped: Int,
        val changed: List<ChangedArtwork>,
    )

    data class ChangedArtwork(val trackId: String, val artworkUrl: String)

    private fun artworkDir(): File = File(context.filesDir, "artwork")

    /** Writes a picture keyed on its own SHA-256; returns the file:// URI, or null. */
    suspend fun storeArtwork(picture: EmbeddedPicture): String? = withContext(Dispatchers.IO) {
        if (picture.data.isEmpty() || picture.data.size > MAX_ARTWORK_BYTES) return@withContext null
        try {
            val digest = MessageDigest.getInstance("SHA-256").digest(picture.data)
            val hash = toHex(digest)
            val dir = artworkDir()
            val file = File(dir, "$hash.${artworkExtension(picture.mimeType)}")
            if (file.exists()) return@withContext file.toURI().toString()
            dir.mkdirs()
            file.outputStream().use { it.write(picture.data) }
            file.toURI().toString()
        } catch (_: Exception) {
            null
        }
    }

    /** Reads a track's file and stores whatever cover it carries. */
    suspend fun extractAndStoreArtwork(uri: String, fileName: String, fileSizeBytes: Long): String? {
        val inspection = inspectionService.inspectAudioFile(uri, fileName, fileSizeBytes, includeArtwork = true)
        val picture = inspection.picture ?: return null
        return storeArtwork(picture)
    }

    /**
     * Records the artwork an import already read out of the hash buffer. Three
     * outcomes: picture found → write + point the row; no picture and tag read in
     * full → stamp the row; no picture and tag truncated → stamp nothing (the
     * picture may sit past the 1 MB window).
     */
    suspend fun saveImportedArtwork(trackId: String, picture: EmbeddedPicture?, tagTruncated: Boolean) {
        val now = System.currentTimeMillis()
        if (picture != null) {
            val uri = storeArtwork(picture)
            // A picture that could not be written leaves the row unstamped so the
            // backfill retries instead of recording artwork that is not on disk.
            if (uri != null) trackDao.setArtwork(trackId, uri, now)
            return
        }
        if (!tagTruncated) trackDao.markArtworkChecked(trackId, now)
    }

    /**
     * Extracts cover art for tracks imported before it was extracted. Bounded on
     * purpose; every examined row is stamped so a file with no cover is never read
     * twice. A failed read is left unstamped (a revoked grant a later pass can fix);
     * a stream is skipped and left unstamped (its bytes have not arrived yet).
     */
    suspend fun backfillArtwork(
        limit: Int = 25,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
        isCancelled: () -> Boolean = { false },
    ): BackfillOutcome = withContext(Dispatchers.IO) {
        val tracks = trackDao.getTracksMissingArtwork(limit).map { it.toDomain() }
        var scanned = 0
        var found = 0
        var empty = 0
        var failed = 0
        var skipped = 0
        val changed = mutableListOf<ChangedArtwork>()
        val now = System.currentTimeMillis()

        for (track in tracks) {
            if (isCancelled()) break
            scanned += 1
            onProgress(scanned, tracks.size)

            val uri = track.fileUri ?: track.sourceUri
            if (uri == null) {
                // No URI can never yield a picture; stamp so it stops occupying a slot.
                trackDao.markArtworkChecked(track.id, now)
                empty += 1
                continue
            }
            if (isStreamUri(uri)) {
                // Location changed under this pass; skip without a stamp.
                skipped += 1
                continue
            }
            try {
                val artwork = extractAndStoreArtwork(uri, track.fileName ?: track.title, track.fileSizeBytes)
                if (artwork != null) {
                    trackDao.setArtwork(track.id, artwork, now)
                    found += 1
                    changed.add(ChangedArtwork(track.id, artwork))
                } else {
                    trackDao.markArtworkChecked(track.id, now)
                    empty += 1
                }
            } catch (_: Exception) {
                failed += 1
            }
        }
        BackfillOutcome(scanned, found, empty, failed, skipped, changed)
    }

    /** How many playable tracks still have to be examined for cover art. */
    suspend fun countTracksMissingArtwork(): Int = trackDao.countMissingArtwork()

    companion object {
        private const val MAX_ARTWORK_BYTES = 4 * 1024 * 1024
    }
}