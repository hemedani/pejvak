package com.pejvak.app.domain

/**
 * Cover art embedded in an audio file, extracted from a byte window (mirrors
 * mobile/src/lib/embeddedArtwork.ts). ID3v2 keeps it in APIC at the head, FLAC
 * in a PICTURE block, MP4 in covr under moov/udta/meta/ilst (usually at the end).
 * Pure — no file access, no storage decisions.
 */

data class ReadArtworkOptions(
    /** Absolute file offset of bytes[0]. */
    val byteOffset: Long = 0,
    /** Real file length, needed to validate a box found in a tail window. */
    val fileSizeBytes: Long,
)

/** MP4 `data` box type codes that name an image format. */
private val MP4_DATA_TYPES: Map<Long, String> = mapOf(
    13L to "image/jpeg", 14L to "image/png", 27L to "image/bmp",
)

private val MIME_BY_EXTENSION: Map<String, String> = mapOf(
    "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png",
    "gif" to "image/gif", "bmp" to "image/bmp", "webp" to "image/webp",
)

/**
 * The picture inside a FLAC PICTURE block:
 * type(4) mimeLength(4) mime descriptionLength(4) description width(4) height(4)
 * depth(4) colors(4) dataLength(4) data.
 */
private fun readFlacPicture(bytes: ByteArray, block: FlacBlock): EmbeddedPicture? {
    val end = block.start + block.length
    if (block.start + 32 > end || end > bytes.size) return null

    val mimeLength = readUint32BE(bytes, block.start + 4).toInt()
    val mimeStart = block.start + 8
    if (mimeStart + mimeLength + 4 > end) return null
    val descriptionLength = readUint32BE(bytes, mimeStart + mimeLength).toInt()
    val dataLengthAt = mimeStart + mimeLength + 4 + descriptionLength + 16
    if (dataLengthAt + 4 > end) return null

    val dataLength = readUint32BE(bytes, dataLengthAt).toInt()
    val dataStart = dataLengthAt + 4
    if (dataLength == 0 || dataStart + dataLength > end || dataStart + dataLength > bytes.size) return null

    val data = bytes.copyOfRange(dataStart, dataStart + dataLength)
    val declared = readAscii(bytes, mimeStart, mimeLength).trim().lowercase()
    return EmbeddedPicture(
        mimeType = sniffImageMime(data) ?: declared.ifEmpty { null },
        pictureType = readUint32BE(bytes, block.start).toInt(),
        data = data,
    )
}

/**
 * The picture inside an MP4 covr box: one or more `data` boxes; the first that
 * carries a recognised image wins. Payload starts 16 bytes into a data box.
 */
private fun readMp4Cover(bytes: ByteArray, moov: Atom): EmbeddedPicture? {
    val covr = findDescendant(bytes, moov, listOf("udta", "meta", "ilst", "covr")) ?: return null

    var offset = covr.start + covr.headerBytes
    while (offset + 16 <= covr.end) {
        val size = readUint32BE(bytes, offset).toInt()
        if (size < 16 || offset + size > covr.end || !matchesAscii(bytes, offset + 4, "data")) break
        val dataType = readUint32BE(bytes, offset + 8)
        val payload = bytes.copyOfRange(offset + 16, offset + size)
        val sniffed = sniffImageMime(payload)
        if (payload.isNotEmpty() && (sniffed != null || MP4_DATA_TYPES.containsKey(dataType))) {
            return EmbeddedPicture(sniffed ?: MP4_DATA_TYPES[dataType], 3, payload)
        }
        offset += size
    }
    return null
}

/**
 * Extracts the cover picture from whichever container the window holds. Returns
 * null rather than a partial image when the picture runs past the window — the
 * caller can re-read a larger window and try again.
 */
fun readEmbeddedArtwork(bytes: ByteArray, options: ReadArtworkOptions): EmbeddedPicture? {
    if (bytes.isEmpty()) return null
    val base = options.byteOffset

    if (base > 0) {
        val moov = scanForMoov(bytes, options.fileSizeBytes, base) ?: return null
        return readMp4Cover(bytes, moov)
    }
    if (matchesAscii(bytes, 0, "ID3")) return readAudioTagBundle(bytes).picture
    if (matchesAscii(bytes, 0, "fLaC")) {
        val picture = flacMetadataBlocks(bytes).firstOrNull { it.type == FLAC_PICTURE_BLOCK } ?: return null
        return readFlacPicture(bytes, picture)
    }
    if (matchesAscii(bytes, 4, "ftyp")) {
        val moov = scanForMoov(bytes, options.fileSizeBytes, 0) ?: return null
        return readMp4Cover(bytes, moov)
    }
    return null
}

/** File extension for a picture MIME type, so the written file has a real name. */
fun artworkExtension(mimeType: String?): String = when (mimeType) {
    "image/png" -> "png"
    "image/gif" -> "gif"
    "image/bmp" -> "bmp"
    "image/webp" -> "webp"
    else -> "jpg"
}

/** MIME type for a stored artwork file's extension. */
fun artworkMimeType(extension: String): String? = MIME_BY_EXTENSION[extension.lowercase()]