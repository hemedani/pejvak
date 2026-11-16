package com.pejvak.app.domain

/**
 * A minimal ID3v2 reader, pure and dependency-free (mirrors mobile/src/lib/audioTags.ts).
 * The scan already reads the first megabyte of every new file for its SHA-256, and an
 * ID3v2 tag lives at offset 0 of that same buffer — parsing it here costs no extra I/O.
 *
 * Two levels, one walk: [AudioTags] is the eight fields importing needs;
 * [AudioTagBundle] adds the extended frames, the embedded picture and tag structure.
 */

data class AudioTags(
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val year: Int? = null,
    /** MVNM — audiobooks use the movement pair as chapter name/number. */
    val movement: String? = null,
    val movementNumber: Int? = null,
)

/** Frames worth showing that nothing depends on. Adding one must never affect an import. */
data class AudioTagDetails(
    val albumArtist: String? = null,
    val composer: String? = null,
    val genre: String? = null,
    val comment: String? = null,
    val bpm: Int? = null,
    val grouping: String? = null,
    val subtitle: String? = null,
    val originalArtist: String? = null,
    val conductor: String? = null,
    val publisher: String? = null,
    val copyright: String? = null,
    val encodedBy: String? = null,
    val encodingSettings: String? = null,
    val isrc: String? = null,
    val language: String? = null,
    val musicalKey: String? = null,
    val mood: String? = null,
    val mediaType: String? = null,
    /** USLT/ULT lyrics, verbatim. */
    val lyrics: String? = null,
)

/** An attached picture frame, decoded but not written anywhere yet. */
data class EmbeddedPicture(
    /** image/jpeg, image/png, … — null when the frame did not say. */
    val mimeType: String?,
    /** ID3v2 picture type: 3 is the front cover. */
    val pictureType: Int?,
    val data: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        other is EmbeddedPicture && mimeType == other.mimeType &&
            pictureType == other.pictureType && data.contentEquals(other.data)

    override fun hashCode(): Int =
        (mimeType?.hashCode() ?: 0) * 31 + (pictureType ?: 0) * 31 + data.contentHashCode()
}

data class AudioTagBundle(
    val tags: AudioTags = AudioTags(),
    val details: AudioTagDetails = AudioTagDetails(),
    /** Null when the tag holds no picture, or it did not fit in the buffer. */
    val picture: EmbeddedPicture? = null,
    /** "ID3v2.3" / "ID3v2.4" / "ID3v2.2", or null when there is no tag. */
    val tagVersion: String? = null,
    /** Bytes the tag declares for its frames, excluding the 10-byte header. */
    val tagSizeBytes: Int = 0,
    /** True when the buffer ended before the tag did — a picture proves nothing then. */
    val truncated: Boolean = false,
    val frameCount: Int = 0,
)

/** Picture bytes beyond this are not artwork, they are a payload. */
const val MAX_PICTURE_BYTES: Int = 4 * 1024 * 1024

private enum class CoreField { Title, Artist, Album, TrackNumber, DiscNumber, Year, Movement, MovementNumber }

private val TEXT_FRAMES: Map<String, CoreField> = mapOf(
    "TIT2" to CoreField.Title, "TPE1" to CoreField.Artist, "TALB" to CoreField.Album,
    "TRCK" to CoreField.TrackNumber, "TPOS" to CoreField.DiscNumber,
    "TDRC" to CoreField.Year, "TYER" to CoreField.Year,
    "MVNM" to CoreField.Movement, "MVIN" to CoreField.MovementNumber,
    "TT2" to CoreField.Title, "TP1" to CoreField.Artist, "TAL" to CoreField.Album,
    "TRK" to CoreField.TrackNumber, "TPA" to CoreField.DiscNumber, "TYE" to CoreField.Year,
)

private enum class DetailField {
    AlbumArtist, Composer, Genre, Bpm, Grouping, Subtitle, OriginalArtist, Conductor,
    Publisher, Copyright, EncodedBy, EncodingSettings, Isrc, Language, MusicalKey, Mood, MediaType,
}

private val DETAIL_FRAMES: Map<String, DetailField> = mapOf(
    "TPE2" to DetailField.AlbumArtist, "TCOM" to DetailField.Composer, "TCON" to DetailField.Genre,
    "TBPM" to DetailField.Bpm, "TIT1" to DetailField.Grouping, "TIT3" to DetailField.Subtitle,
    "TOPE" to DetailField.OriginalArtist, "TPE3" to DetailField.Conductor, "TPUB" to DetailField.Publisher,
    "TCOP" to DetailField.Copyright, "TENC" to DetailField.EncodedBy, "TSSE" to DetailField.EncodingSettings,
    "TSRC" to DetailField.Isrc, "TLAN" to DetailField.Language, "TKEY" to DetailField.MusicalKey,
    "TMOO" to DetailField.Mood, "TMED" to DetailField.MediaType,
    "TP2" to DetailField.AlbumArtist, "TCM" to DetailField.Composer, "TCO" to DetailField.Genre,
    "TBP" to DetailField.Bpm, "TT1" to DetailField.Grouping, "TT3" to DetailField.Subtitle,
    "TOA" to DetailField.OriginalArtist, "TP3" to DetailField.Conductor, "TPB" to DetailField.Publisher,
    "TCR" to DetailField.Copyright, "TEN" to DetailField.EncodedBy, "TKE" to DetailField.MusicalKey,
)

private val COMMENT_FRAMES = setOf("COMM", "COM")
private val LYRICS_FRAMES = setOf("USLT", "ULT")

private fun Byte.u(): Int = toInt() and 0xff

private fun syncSafeInt(bytes: ByteArray, offset: Int): Int =
    ((bytes[offset].u() and 0x7f) shl 21) or
        ((bytes[offset + 1].u() and 0x7f) shl 14) or
        ((bytes[offset + 2].u() and 0x7f) shl 7) or
        (bytes[offset + 3].u() and 0x7f)

private fun uint32(bytes: ByteArray, offset: Int): Long =
    ((bytes[offset].u().toLong() shl 24) or
        (bytes[offset + 1].u().toLong() shl 16) or
        (bytes[offset + 2].u().toLong() shl 8) or
        bytes[offset + 3].u().toLong())

private fun uint24(bytes: ByteArray, offset: Int): Int =
    (bytes[offset].u() shl 16) or (bytes[offset + 1].u() shl 8) or bytes[offset + 2].u()

private fun ascii(bytes: ByteArray, offset: Int, length: Int): String {
    val sb = StringBuilder(length)
    for (i in 0 until length) sb.append((bytes[offset + i].toInt() and 0xff).toChar())
    return sb.toString()
}

private fun decodeLatin1(bytes: ByteArray, from: Int = 0, to: Int = bytes.size): String {
    val sb = StringBuilder(to - from)
    for (i in from until to) sb.append((bytes[i].toInt() and 0xff).toChar())
    return sb.toString()
}

/** Malformed lead bytes are skipped rather than throwing away the frame. */
private fun decodeUtf8(bytes: ByteArray, from: Int, to: Int): String =
    String(bytes, from, to - from, Charsets.UTF_8)

/**
 * bomAware distinguishes encoding 1 (UTF-16 with BOM) from encoding 2 (UTF-16BE,
 * which by definition carries none). Encoders that omit the BOM on encoding 1
 * almost always mean little-endian.
 */
private fun decodeUtf16(bytes: ByteArray, from: Int, to: Int, bomAware: Boolean): String {
    var start = from
    var littleEndian = false
    if (bomAware && to - from >= 2) {
        when {
            bytes[from].u() == 0xff && bytes[from + 1].u() == 0xfe -> { littleEndian = true; start += 2 }
            bytes[from].u() == 0xfe && bytes[from + 1].u() == 0xff -> { littleEndian = false; start += 2 }
            else -> littleEndian = true
        }
    }
    val sb = StringBuilder()
    var i = start
    while (i + 1 < to) {
        val unit = if (littleEndian) bytes[i].u() or (bytes[i + 1].u() shl 8)
        else (bytes[i].u() shl 8) or bytes[i + 1].u()
        sb.append(unit.toChar())
        i += 2
    }
    return sb.toString()
}

private fun encodingWidth(encoding: Int): Int = if (encoding == 1 || encoding == 2) 2 else 1

private fun decodeWithEncoding(bytes: ByteArray, from: Int, to: Int, encoding: Int): String = when (encoding) {
    0 -> decodeLatin1(bytes, from, to)
    1 -> decodeUtf16(bytes, from, to, true)
    2 -> decodeUtf16(bytes, from, to, false)
    3 -> decodeUtf8(bytes, from, to)
    else -> ""
}

/** Reads a null-terminated string honouring the frame's encoding (UTF-16 terminator is 00 00). */
private fun readTerminated(bytes: ByteArray, offset: Int, encoding: Int): Pair<String, Int> {
    val width = encodingWidth(encoding)
    var end = offset
    while (end + width <= bytes.size) {
        val terminated = if (width == 1) bytes[end].u() == 0
        else bytes[end].u() == 0 && bytes[end + 1].u() == 0
        if (terminated) break
        end += width
    }
    return decodeWithEncoding(bytes, offset, end, encoding) to (end + width)
}

/** Text frames are null-separated when they carry multiple values. */
private fun firstValue(text: String): String? =
    text.split('\u0000').firstOrNull()?.trim()?.ifEmpty { null }

private fun decodeTextFrame(body: ByteArray): String? {
    if (body.isEmpty()) return null
    return firstValue(decodeWithEncoding(body, 1, body.size, body[0].u()))
}

/** COMM/USLT are encoding | language(3) | description | text. */
private fun decodeDescribedFrame(body: ByteArray): Pair<String?, String?> {
    if (body.size < 4) return null to null
    val encoding = body[0].u()
    val language = decodeLatin1(body, 1, 4).replace("\u0000", "").trim().ifEmpty { null }
    val (_, next) = readTerminated(body, 4, encoding)
    val text = decodeWithEncoding(body, minOf(next, body.size), body.size, encoding).trim().ifEmpty { null }
    return text to language
}

private val MIME_BY_FORMAT = mapOf(
    "JPG" to "image/jpeg", "JPEG" to "image/jpeg", "PNG" to "image/png",
    "GIF" to "image/gif", "BMP" to "image/bmp", "WEBP" to "image/webp", "TIFF" to "image/tiff",
)

/** The image format as the bytes themselves declare it. */
fun sniffImageMime(bytes: ByteArray): String? {
    if (bytes.size >= 3 && bytes[0].u() == 0xff && bytes[1].u() == 0xd8 && bytes[2].u() == 0xff) return "image/jpeg"
    if (bytes.size >= 8 && bytes[0].u() == 0x89 && bytes[1].u() == 0x50 && bytes[2].u() == 0x4e && bytes[3].u() == 0x47) return "image/png"
    if (bytes.size >= 6 && ascii(bytes, 0, 3) == "GIF") return "image/gif"
    if (bytes.size >= 2 && bytes[0].u() == 0x42 && bytes[1].u() == 0x4d) return "image/bmp"
    if (bytes.size >= 12 && ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WEBP") return "image/webp"
    return null
}

/**
 * APIC (v2.3/v2.4) is encoding | mime | type | description | data; PIC (v2.2)
 * replaces the MIME string with a three-character format code.
 */
private fun decodePictureFrame(body: ByteArray, isV22: Boolean): EmbeddedPicture? {
    if (body.size < 5) return null
    val encoding = body[0].u()

    var mimeType: String?
    var cursor: Int
    if (isV22) {
        val code = decodeLatin1(body, 1, 4).trim().uppercase()
        mimeType = MIME_BY_FORMAT[code] ?: if (code.length == 3) "image/${code.lowercase()}" else null
        cursor = 4
    } else {
        val (text, next) = readTerminated(body, 1, 0)
        // "-->" means the "picture" is a URL to fetch, not image bytes.
        if (text.trim() == "-->") return null
        mimeType = text.trim().ifEmpty { null }?.lowercase()
        cursor = next
    }

    if (cursor >= body.size) return null
    val pictureType = body[cursor].u()
    cursor += 1

    val (_, next) = readTerminated(body, cursor, encoding)
    val start = minOf(next, body.size)
    val data = body.copyOfRange(start, body.size)
    if (data.isEmpty() || data.size > MAX_PICTURE_BYTES) return null

    // Some taggers write a generic or wrong MIME; the magic bytes are the truth.
    return EmbeddedPicture(sniffImageMime(data) ?: mimeType, pictureType, data)
}

/** TRCK/TPOS/MVIN are `n` or `n/total`; only `n` is meaningful here. */
private fun leadingInteger(value: String): Int? =
    Regex("^(\\d{1,4})").find(value.trim())?.groupValues?.get(1)?.toIntOrNull()

/** TDRC is a full timestamp; TYER is a bare year. */
private fun leadingYear(value: String): Int? =
    Regex("^(\\d{4})").find(value.trim())?.groupValues?.get(1)?.toIntOrNull()
        ?.takeIf { it in 1000..2999 }

/** Removes the 0xFF 0x00 padding an unsynchronised tag inserts (whole-tag flag). */
private fun deunsynchronise(bytes: ByteArray): ByteArray {
    val out = ByteArray(bytes.size)
    var written = 0
    var i = 0
    while (i < bytes.size) {
        out[written] = bytes[i]
        written += 1
        if (bytes[i].u() == 0xff && i + 1 < bytes.size && bytes[i + 1].u() == 0x00) i += 1
        i += 1
    }
    return out.copyOf(written)
}

/**
 * Bytes the ID3v2 tag at offset 0 declares for its frames, excluding the 10-byte
 * header — or null when the buffer does not start with one.
 */
fun readId3TagSize(bytes: ByteArray): Int? {
    if (bytes.size < 10 || bytes[0].u() != 0x49 || bytes[1].u() != 0x44 || bytes[2].u() != 0x33) return null
    val major = bytes[3].u()
    if (major < 2 || major > 4) return null
    return syncSafeInt(bytes, 6)
}

fun hasId3Header(bytes: ByteArray): Boolean = readId3TagSize(bytes) != null

/**
 * Reads the ID3v2 tag at the start of [bytes]. A malformed tag must never fail an
 * import — anything unrecognised yields the empty bundle. A picture that does not
 * fit entirely inside the buffer is reported as absent, not truncated.
 */
fun readAudioTagBundle(bytes: ByteArray): AudioTagBundle {
    val declared = readId3TagSize(bytes) ?: return AudioTagBundle()
    val major = bytes[3].u()
    val truncated = 10 + declared > bytes.size

    var tags = AudioTags()
    var details = AudioTagDetails()
    var picture: EmbeddedPicture? = null
    var frameCount = 0

    val flags = bytes[5].u()
    val tagEnd = minOf(10 + declared, bytes.size)
    var body = bytes.copyOfRange(10, tagEnd)
    if (flags and 0x80 != 0) body = deunsynchronise(body)

    var offset = 0
    if (flags and 0x40 != 0) {
        // Extended header. v2.4's size field counts itself; v2.3's does not.
        if (body.size < 4) return AudioTagBundle(tagVersion = "ID3v2.$major", tagSizeBytes = declared, truncated = truncated)
        offset = if (major == 4) syncSafeInt(body, 0) else 4 + uint32(body, 0).toInt()
    }

    val idLength = if (major == 2) 3 else 4
    val headerLength = if (major == 2) 6 else 10

    while (offset + headerLength <= body.size) {
        if (body[offset].u() == 0) break // Padding: every remaining byte is zero.
        val frameId = ascii(body, offset, idLength)
        val frameSize = when (major) {
            2 -> uint24(body, offset + 3)
            4 -> syncSafeInt(body, offset + 4)
            else -> uint32(body, offset + 4).toInt()
        }
        if (frameSize <= 0 || offset + headerLength + frameSize > body.size) break

        val frame = body.copyOfRange(offset + headerLength, offset + headerLength + frameSize)
        frameCount += 1

        val coreField = TEXT_FRAMES[frameId]
        val detailField = DETAIL_FRAMES[frameId]

        if (coreField != null || detailField != null) {
            val text = decodeTextFrame(frame)
            if (text != null) {
                if (coreField != null) {
                    tags = when (coreField) {
                        CoreField.Title -> tags.copy(title = text)
                        CoreField.Artist -> tags.copy(artist = text)
                        CoreField.Album -> tags.copy(album = text)
                        CoreField.TrackNumber -> leadingInteger(text)?.let { tags.copy(trackNumber = it) } ?: tags
                        CoreField.DiscNumber -> leadingInteger(text)?.let { tags.copy(discNumber = it) } ?: tags
                        CoreField.Year -> leadingYear(text)?.let { tags.copy(year = it) } ?: tags
                        CoreField.Movement -> tags.copy(movement = text)
                        CoreField.MovementNumber -> leadingInteger(text)?.let { tags.copy(movementNumber = it) } ?: tags
                    }
                }
                if (detailField != null) {
                    details = when (detailField) {
                        DetailField.AlbumArtist -> details.copy(albumArtist = text)
                        DetailField.Composer -> details.copy(composer = text)
                        DetailField.Genre -> details.copy(genre = resolveGenre(text))
                        DetailField.Bpm -> leadingInteger(text)?.let { details.copy(bpm = it) } ?: details
                        DetailField.Grouping -> details.copy(grouping = text)
                        DetailField.Subtitle -> details.copy(subtitle = text)
                        DetailField.OriginalArtist -> details.copy(originalArtist = text)
                        DetailField.Conductor -> details.copy(conductor = text)
                        DetailField.Publisher -> details.copy(publisher = text)
                        DetailField.Copyright -> details.copy(copyright = text)
                        DetailField.EncodedBy -> details.copy(encodedBy = text)
                        DetailField.EncodingSettings -> details.copy(encodingSettings = text)
                        DetailField.Isrc -> details.copy(isrc = text)
                        DetailField.Language -> details.copy(language = text)
                        DetailField.MusicalKey -> details.copy(musicalKey = text)
                        DetailField.Mood -> details.copy(mood = text)
                        DetailField.MediaType -> details.copy(mediaType = text)
                    }
                }
            }
        } else if (frameId in COMMENT_FRAMES) {
            val (text, language) = decodeDescribedFrame(frame)
            details = details.copy(comment = details.comment ?: text, language = details.language ?: language)
        } else if (frameId in LYRICS_FRAMES) {
            val (text, language) = decodeDescribedFrame(frame)
            details = details.copy(lyrics = details.lyrics ?: text, language = details.language ?: language)
        } else if (frameId == "APIC" || frameId == "PIC") {
            // First picture wins: a tag with several carries the front cover first.
            if (picture == null) picture = decodePictureFrame(frame, frameId == "PIC")
        }

        offset += headerLength + frameSize
    }

    return AudioTagBundle(tags, details, picture, "ID3v2.$major", declared, truncated, frameCount)
}

/** The eight fields an import needs — a projection of [readAudioTagBundle]. */
fun readAudioTags(bytes: ByteArray): AudioTags = readAudioTagBundle(bytes).tags