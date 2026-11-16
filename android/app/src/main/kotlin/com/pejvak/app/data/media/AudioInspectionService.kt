package com.pejvak.app.data.media

import com.pejvak.app.domain.AudioInfo
import com.pejvak.app.domain.AudioTagBundle
import com.pejvak.app.domain.EmbeddedPicture
import com.pejvak.app.domain.ParseAudioInfoOptions
import com.pejvak.app.domain.ReadArtworkOptions
import com.pejvak.app.domain.isStreamUri
import com.pejvak.app.domain.matchesAscii
import com.pejvak.app.domain.parseAudioInfo
import com.pejvak.app.domain.readAudioTagBundle
import com.pejvak.app.domain.readEmbeddedArtwork
import com.pejvak.app.domain.readId3TagSize
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads a bounded window of an audio file and answers everything the bytes can be
 * asked: the tag, the stream parameters, and whether a cover picture is in there
 * (mirrors AudioInspectionService.ts). Reads as little as it can: one 512 KB head
 * window, a larger one only when the tag declares itself bigger, and a tail window
 * only for MP4 (whose moov normally sits at the end). Nothing here writes.
 */
@Singleton
class AudioInspectionService @Inject constructor(
    private val fileIo: FileIo,
) {
    data class AudioInspection(
        val info: AudioInfo,
        val tag: AudioTagBundle,
        /** The picture's bytes — only when includeArtwork was asked for. */
        val picture: EmbeddedPicture?,
        val artworkBytes: Int?,
        val artworkMime: String?,
    )

    fun inspectAudioFile(
        uri: String,
        fileName: String,
        fileSizeBytes: Long,
        includeArtwork: Boolean = false,
    ): AudioInspection {
        // Refused before the first read: a stream URL is not a slow read, it is
        // not a read at all. A retrying caller must be told "never", not "not now".
        if (isStreamUri(uri)) {
            throw IllegalStateException("This track streams from its source; there is no file on this device to read.")
        }

        val size = if (fileSizeBytes > 0) fileSizeBytes else 0L
        var head = fileIo.readWindow(uri, 0, if (size > 0) minOf(size, HEAD_WINDOW_BYTES.toLong()).toInt() else HEAD_WINDOW_BYTES)

        // An ID3 tag states its own length, so an overflowing tag is read exactly.
        val declaredTag = readId3TagSize(head)
        if (declaredTag != null && 10 + declaredTag > head.size && 10 + declaredTag <= MAX_TAG_WINDOW_BYTES) {
            val wanted = if (size > 0) minOf(size, (10 + declaredTag).toLong()).toInt() else 10 + declaredTag
            val bigger = fileIo.readWindow(uri, 0, wanted)
            if (bigger.size > head.size) head = bigger
        }

        val tag = if (head.isNotEmpty()) readAudioTagBundle(head) else AudioTagBundle()
        var picture = if (head.isNotEmpty()) readEmbeddedArtwork(head, ReadArtworkOptions(fileSizeBytes = size)) else null
        var info = parseAudioInfo(head, ParseAudioInfoOptions(fileName, size))

        // MP4 keeps moov at the end unless written for streaming; one tail read
        // completes everything the head window could not see.
        val tailStart = size - TAIL_WINDOW_BYTES
        if (matchesAscii(head, 4, "ftyp") && tailStart > 0 && (picture == null || info.codec == null)) {
            val tail = fileIo.readWindow(uri, tailStart, TAIL_WINDOW_BYTES)
            if (tail.isNotEmpty()) {
                if (picture == null) {
                    picture = readEmbeddedArtwork(tail, ReadArtworkOptions(byteOffset = tailStart, fileSizeBytes = size))
                }
                info = mergeAudioInfo(info, parseAudioInfo(tail, ParseAudioInfoOptions(fileName, size, byteOffset = tailStart)))
            }
        }

        return AudioInspection(
            info = info,
            tag = tag,
            picture = if (includeArtwork) picture else null,
            artworkBytes = picture?.data?.size,
            artworkMime = picture?.mimeType,
        )
    }

    private fun mergeAudioInfo(head: AudioInfo, tail: AudioInfo): AudioInfo = AudioInfo(
        container = head.container ?: tail.container,
        codec = head.codec ?: tail.codec,
        bitrateKbps = head.bitrateKbps ?: tail.bitrateKbps,
        variableBitrate = head.variableBitrate || tail.variableBitrate,
        sampleRateHz = head.sampleRateHz ?: tail.sampleRateHz,
        channels = head.channels ?: tail.channels,
        channelMode = head.channelMode ?: tail.channelMode,
        bitsPerSample = head.bitsPerSample ?: tail.bitsPerSample,
        durationSec = head.durationSec ?: tail.durationSec,
    )

    companion object {
        private const val HEAD_WINDOW_BYTES = 512 * 1024
        private const val MAX_TAG_WINDOW_BYTES = 4 * 1024 * 1024
        private const val TAIL_WINDOW_BYTES = 1024 * 1024
    }
}