package com.pejvak.app.data.media

import com.pejvak.app.domain.AudioTagBundle
import com.pejvak.app.domain.CONTENT_HASH_CHUNK_BYTES
import com.pejvak.app.domain.contentHashFromChunk
import com.pejvak.app.domain.readAudioTagBundle
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Computes a track's identity from a local file and reads its ID3 tags on the way
 * past (mirrors ContentHashService.ts). Only the first 1 MB is read; the ID3v2 tag
 * sits at offset 0 of that same buffer, so identifying a file costs a single pass.
 */
@Singleton
class ContentHashService @Inject constructor(
    private val fileIo: FileIo,
) {
    data class FileHashResult(
        val contentHash: String,
        val fileSizeBytes: Long,
        val bundle: AudioTagBundle,
    )

    /**
     * [sizeBytes] should be supplied by callers that already know it. A size of
     * zero is not a size — an unknown size reads the whole window and takes the
     * length of what actually arrived (exact under 1 MB, under-reported above).
     */
    fun computeFileContentHash(uri: String, sizeBytes: Long? = null): FileHashResult {
        val known = sizeBytes?.takeIf { it > 0 } ?: fileIo.fileSize(uri)?.takeIf { it > 0 }
        val readLength = minOf(known ?: CONTENT_HASH_CHUNK_BYTES.toLong(), CONTENT_HASH_CHUNK_BYTES.toLong()).toInt()
        val chunk = fileIo.readWindow(uri, 0, readLength)
        if (chunk.isEmpty()) throw IllegalStateException("unreadable")
        val fileSizeBytes = known ?: chunk.size.toLong()
        val contentHash = contentHashFromChunk(chunk, fileSizeBytes)
        val bundle = readAudioTagBundle(chunk)
        return FileHashResult(contentHash, fileSizeBytes, bundle)
    }
}