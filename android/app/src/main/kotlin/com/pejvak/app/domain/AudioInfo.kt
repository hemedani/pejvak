package com.pejvak.app.domain

/**
 * What the audio stream itself declares, read from the bytes (mirrors
 * mobile/src/lib/audioInfo.ts). No estimates from file size, no guesses from the
 * extension. Null means "the file did not say" — a different claim from zero.
 * Pure: the caller supplies a bounded window and its absolute file offset.
 */

data class AudioInfo(
    /** Container as shown: MP3, M4B, FLAC, WAV, Ogg. */
    val container: String? = null,
    /** Compression format: MPEG-1 Layer III, AAC, FLAC, PCM. */
    val codec: String? = null,
    /** Bitrate the stream declares, in kbps. Null for containers that omit it. */
    val bitrateKbps: Int? = null,
    val variableBitrate: Boolean = false,
    val sampleRateHz: Int? = null,
    val channels: Int? = null,
    /** Stereo, Joint stereo, Mono, Dual channel. */
    val channelMode: String? = null,
    val bitsPerSample: Int? = null,
    /** Duration the stream declares; null when the header alone cannot state one. */
    val durationSec: Double? = null,
)

data class ParseAudioInfoOptions(
    /** Used only to label the container when the bytes do not name it. */
    val fileName: String,
    val fileSizeBytes: Long,
    /** Absolute file offset of bytes[0]. Lets a caller read a tail window. */
    val byteOffset: Long = 0,
)

private fun channelLabel(channels: Int?): String? = when (channels) {
    null -> null
    1 -> "Mono"
    2 -> "Stereo"
    else -> "$channels channels"
}

// --- MPEG audio (MP3 / MP2) ---

private val MPEG_BITRATES: Map<String, IntArray> = mapOf(
    "1-1" to intArrayOf(0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448),
    "1-2" to intArrayOf(0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384),
    "1-3" to intArrayOf(0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320),
    "2-1" to intArrayOf(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256),
    "2-2" to intArrayOf(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
    "2-3" to intArrayOf(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
)

private fun mpegSampleRate(version: Double, index: Int): Int? = when (version) {
    1.0 -> intArrayOf(44100, 48000, 32000).getOrNull(index)
    2.0 -> intArrayOf(22050, 24000, 16000).getOrNull(index)
    2.5 -> intArrayOf(11025, 12000, 8000).getOrNull(index)
    else -> null
}

private val CHANNEL_MODES = arrayOf("Stereo", "Joint stereo", "Dual channel", "Mono")

private data class MpegFrame(
    val version: Double,
    val layer: Int,
    val bitrateKbps: Int,
    val sampleRateHz: Int,
    val channelMode: String,
    val channels: Int,
    val frameLength: Int,
    val samplesPerFrame: Int,
    val sideInfoBytes: Int,
    val offset: Int,
)

private fun parseMpegFrame(bytes: ByteArray, offset: Int): MpegFrame? {
    if (offset + 4 > bytes.size) return null
    val header = readUint32BE(bytes, offset)
    if ((header ushr 21) != 0x7ffL) return null

    val versionBits = ((header ushr 19) and 0x3).toInt()
    val layerBits = ((header ushr 17) and 0x3).toInt()
    val bitrateIndex = ((header ushr 12) and 0xf).toInt()
    val sampleRateIndex = ((header ushr 10) and 0x3).toInt()
    val padding = ((header ushr 9) and 0x1).toInt()
    val channelModeIndex = ((header ushr 6) and 0x3).toInt()

    if (versionBits == 1 || layerBits == 0 || bitrateIndex == 0 || bitrateIndex == 0xf) return null
    if (sampleRateIndex == 3) return null

    val version = if (versionBits == 3) 1.0 else if (versionBits == 2) 2.0 else 2.5
    val layer = 4 - layerBits
    val bitrateTable = MPEG_BITRATES["${if (version == 1.0) 1 else 2}-$layer"] ?: return null
    val sampleRate = mpegSampleRate(version, sampleRateIndex) ?: return null
    val bitrateKbps = bitrateTable.getOrNull(bitrateIndex)?.takeIf { it > 0 } ?: return null

    val mono = channelModeIndex == 3
    val sideInfoBytes = if (layer == 3) (if (version == 1.0) (if (mono) 17 else 32) else if (mono) 9 else 17) else 0
    val samplesPerFrame = if (layer == 1) 384 else if (layer == 3 && version != 1.0) 576 else 1152
    val frameLength = if (layer == 1) {
        ((12 * bitrateKbps * 1000) / sampleRate + padding) * 4
    } else {
        ((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate + padding
    }
    if (frameLength <= 4) return null

    return MpegFrame(
        version, layer, bitrateKbps, sampleRate,
        CHANNEL_MODES.getOrElse(channelModeIndex) { "Stereo" },
        if (mono) 1 else 2, frameLength, samplesPerFrame, sideInfoBytes, offset,
    )
}

private fun layerLabel(layer: Int): String = when (layer) { 1 -> "I"; 2 -> "II"; else -> "III" }

private data class VbrHeader(val frames: Long?, val bytes: Long?, val tag: String)

/** The VBR header a LAME or Fraunhofer encoder writes into the first frame. */
private fun readVbrHeader(bytes: ByteArray, frame: MpegFrame): VbrHeader? {
    val xingAt = frame.offset + 4 + frame.sideInfoBytes
    if (matchesAscii(bytes, xingAt, "Xing") || matchesAscii(bytes, xingAt, "Info")) {
        val tag = readAscii(bytes, xingAt, 4)
        val flags = readUint32BE(bytes, xingAt + 4)
        var cursor = xingAt + 8
        var frames: Long? = null
        var byteCount: Long? = null
        if (flags and 0x1 != 0L) {
            frames = readUint32BE(bytes, cursor)
            cursor += 4
        }
        if (flags and 0x2 != 0L) byteCount = readUint32BE(bytes, cursor)
        return VbrHeader(frames, byteCount, tag)
    }
    // VBRI is always 32 bytes past the header, regardless of version or channels.
    val vbriAt = frame.offset + 36
    if (matchesAscii(bytes, vbriAt, "VBRI")) {
        return VbrHeader(readUint32BE(bytes, vbriAt + 14), readUint32BE(bytes, vbriAt + 10), "VBRI")
    }
    return null
}

private fun parseMpeg(bytes: ByteArray, start: Int, options: ParseAudioInfoOptions): AudioInfo? {
    // Scan for the first frame sync; reserved-bit checks reject false positives.
    var offset = start
    var frame: MpegFrame? = null
    while (offset + 4 <= bytes.size) {
        val candidate = parseMpegFrame(bytes, offset)
        if (candidate != null) { frame = candidate; break }
        offset += 1
    }
    val f = frame ?: return null

    val vbr = readVbrHeader(bytes, f)
    val versionLabel = if (f.version == 1.0) "1" else if (f.version == 2.0) "2" else "2.5"
    var info = AudioInfo(
        container = if (f.version == 1.0) "MP3" else "MP3 (MPEG-2)",
        codec = "MPEG-$versionLabel Layer ${layerLabel(f.layer)}",
        sampleRateHz = f.sampleRateHz,
        channels = f.channels,
        channelMode = f.channelMode,
        bitrateKbps = f.bitrateKbps,
    )

    val frames = vbr?.frames
    if (frames != null && frames > 0) {
        val durationSec = (frames * f.samplesPerFrame).toDouble() / f.sampleRateHz
        // "Xing"/"VBRI" mean the encoder varied the bitrate; "Info" is LAME's CBR marker.
        info = info.copy(variableBitrate = vbr.tag != "Info", durationSec = durationSec)
        val byteCount = vbr.bytes
        if (byteCount != null && byteCount > 0 && durationSec > 0) {
            info = info.copy(bitrateKbps = Math.round((byteCount * 8) / durationSec / 1000).toInt())
        }
    } else {
        // No VBR header: two frames with different bitrates settle the question.
        val next = parseMpegFrame(bytes, f.offset + f.frameLength)
        if (next != null && next.bitrateKbps != f.bitrateKbps) {
            info = info.copy(variableBitrate = true)
        } else {
            val audioBytes = options.fileSizeBytes - options.byteOffset - f.offset
            if (audioBytes > 0) {
                info = info.copy(durationSec = (audioBytes * 8).toDouble() / (f.bitrateKbps * 1000))
            }
        }
    }
    return info
}

// --- FLAC ---

/** FLAC's PICTURE block type, shared with the artwork reader. */
const val FLAC_PICTURE_BLOCK = 6

data class FlacBlock(val type: Int, val start: Int, val length: Int)

/** Walks FLAC's metadata block headers after the `fLaC` marker. */
fun flacMetadataBlocks(bytes: ByteArray): List<FlacBlock> {
    val blocks = mutableListOf<FlacBlock>()
    if (!matchesAscii(bytes, 0, "fLaC")) return blocks
    var offset = 4
    while (offset + 4 <= bytes.size) {
        val header = bytes[offset].toInt() and 0xff
        val length = ((bytes[offset + 1].toInt() and 0xff) shl 16) or
            ((bytes[offset + 2].toInt() and 0xff) shl 8) or
            (bytes[offset + 3].toInt() and 0xff)
        blocks.add(FlacBlock(header and 0x7f, offset + 4, length))
        if (header and 0x80 != 0) break
        offset += 4 + length
    }
    return blocks
}

private fun parseFlac(bytes: ByteArray): AudioInfo? {
    val streamInfo = flacMetadataBlocks(bytes).firstOrNull { it.type == 0 } ?: return null
    if (streamInfo.length < 34) return null

    // STREAMINFO packs sampleRate(20) channels-1(3) bitsPerSample-1(5) totalSamples(36)
    // into the eight bytes at +10, MSB first.
    val packed = streamInfo.start + 10
    if (packed + 8 > bytes.size) return null
    val sampleRateHz = (readUint32BE(bytes, packed) ushr 12).toInt()
    val b2 = bytes[packed + 2].toInt() and 0xff
    val b3 = bytes[packed + 3].toInt() and 0xff
    val channels = ((b2 ushr 1) and 0x7) + 1
    val bitsPerSample = (((b2 and 0x1) shl 4) or (b3 ushr 4)) + 1
    val totalSamples = (b3 and 0x0f).toLong() * 0x100000000L + readUint32BE(bytes, packed + 4)

    return AudioInfo(
        container = "FLAC", codec = "FLAC", sampleRateHz = sampleRateHz,
        channels = channels, channelMode = channelLabel(channels), bitsPerSample = bitsPerSample,
        durationSec = if (sampleRateHz > 0) totalSamples.toDouble() / sampleRateHz else null,
    )
}

// --- WAV ---

private val WAVE_FORMATS: Map<Int, String> = mapOf(
    0x0001 to "PCM", 0x0003 to "IEEE float", 0x0006 to "A-law",
    0x0007 to "µ-law", 0xfffe to "PCM (extensible)",
)

private fun parseWav(bytes: ByteArray): AudioInfo? {
    if (!matchesAscii(bytes, 0, "RIFF") || !matchesAscii(bytes, 8, "WAVE")) return null

    var offset = 12
    var format: Int? = null
    var channels: Int? = null
    var sampleRateHz: Int? = null
    var byteRate: Long? = null
    var bitsPerSample: Int? = null
    var dataBytes: Long? = null

    while (offset + 8 <= bytes.size) {
        val id = readAscii(bytes, offset, 4)
        val size = readUint32LE(bytes, offset + 4)
        val body = offset + 8
        if (id == "fmt " && body + 16 <= bytes.size) {
            format = readUint16LE(bytes, body)
            channels = readUint16LE(bytes, body + 2)
            sampleRateHz = readUint32LE(bytes, body + 4).toInt()
            byteRate = readUint32LE(bytes, body + 8)
            bitsPerSample = readUint16LE(bytes, body + 14)
        } else if (id == "data") {
            dataBytes = size
            break
        }
        // Chunks are word-aligned: an odd size is followed by one pad byte.
        offset = body + size.toInt() + (size % 2).toInt()
    }

    val rate = sampleRateHz ?: return null
    val ch = channels ?: return null

    return AudioInfo(
        container = "WAV",
        codec = format?.let { WAVE_FORMATS[it] ?: "Format 0x${it.toString(16)}" },
        sampleRateHz = rate, channels = ch, channelMode = channelLabel(ch),
        bitsPerSample = bitsPerSample,
        bitrateKbps = byteRate?.takeIf { it > 0 }?.let { Math.round((it * 8).toDouble() / 1000).toInt() },
        durationSec = if (dataBytes != null && byteRate != null && byteRate > 0) dataBytes.toDouble() / byteRate else null,
    )
}

// --- Ogg ---

private fun parseOgg(bytes: ByteArray): AudioInfo? {
    if (!matchesAscii(bytes, 0, "OggS")) return null
    // Header is 27 bytes; page_segments is its last byte, so the first packet
    // starts 27 + page_segments in.
    val packetStart = 27 + (bytes.getOrElse(26) { 0 }.toInt() and 0xff)
    if (packetStart >= bytes.size) return null

    if (matchesAscii(bytes, packetStart + 1, "vorbis")) {
        val channels = bytes.getOrElse(packetStart + 11) { 0 }.toInt() and 0xff
        val sampleRateHz = readUint32LE(bytes, packetStart + 12).toInt()
        val nominal = readUint32LE(bytes, packetStart + 20)
        return AudioInfo(
            container = "Ogg", codec = "Vorbis",
            sampleRateHz = sampleRateHz.takeIf { it > 0 },
            channels = channels.takeIf { it > 0 }, channelMode = channelLabel(channels.takeIf { it > 0 }),
            bitrateKbps = if (nominal > 0) Math.round(nominal.toDouble() / 1000).toInt() else null,
            variableBitrate = true,
        )
    }

    if (matchesAscii(bytes, packetStart, "OpusHead")) {
        val channels = bytes.getOrElse(packetStart + 9) { 0 }.toInt() and 0xff
        val inputSampleRate = readUint32LE(bytes, packetStart + 12).toInt()
        return AudioInfo(
            container = "Ogg", codec = "Opus",
            // Opus always decodes at 48 kHz; the header's rate is the source rate.
            sampleRateHz = if (inputSampleRate > 0) inputSampleRate else 48000,
            channels = channels.takeIf { it > 0 }, channelMode = channelLabel(channels.takeIf { it > 0 }),
            variableBitrate = true,
        )
    }

    if (matchesAscii(bytes, packetStart, "\u007fFLAC")) {
        return AudioInfo(container = "Ogg", codec = "FLAC")
    }
    return AudioInfo(container = "Ogg")
}

// --- MP4 / M4A / M4B ---

private val MP4_BRANDS: Map<String, String> = mapOf(
    "M4A " to "M4A", "M4B " to "M4B", "M4P " to "M4P",
    "mp42" to "MP4", "mp41" to "MP4", "isom" to "MP4", "iso2" to "MP4", "dash" to "MP4",
    "3gp4" to "3GP", "3gp5" to "3GP", "qt  " to "QuickTime",
)

private val MP4_CODECS: Map<String, String> = mapOf(
    "mp4a" to "AAC", "alac" to "ALAC", "ac-3" to "AC-3", "ec-3" to "E-AC-3", "ac-4" to "AC-4",
    "fLaC" to "FLAC", "Opus" to "Opus", "samr" to "AMR-NB", "sawb" to "AMR-WB",
    "twos" to "PCM (signed)", "sowt" to "PCM (little-endian)", "lpcm" to "PCM",
    "alaw" to "A-law", "ulaw" to "µ-law",
)

private data class SampleEntry(
    val format: String,
    val channels: Int?,
    val bitsPerSample: Int?,
    val sampleRateHz: Int?,
)

/** stsd holds the audio sample entry — the only place an MP4 states channels/rate. */
private fun readSampleEntry(bytes: ByteArray, stsd: Atom): SampleEntry? {
    // stsd is version/flags(4) then entryCount(4) before the first entry.
    val body = stsd.start + stsd.headerBytes + 8
    val size = readUint32BE(bytes, body)
    if (size < 36 || body + 36 > bytes.size) return null
    val channels = readUint16BE(bytes, body + 24)
    val bitsPerSample = readUint16BE(bytes, body + 26)
    // The rate is 16.16 fixed point; any fractional part is noise.
    val sampleRateHz = readUint16BE(bytes, body + 32)
    return SampleEntry(
        readAscii(bytes, body + 4, 4),
        channels.takeIf { it > 0 }, bitsPerSample.takeIf { it > 0 }, sampleRateHz.takeIf { it > 0 },
    )
}

private fun parseMp4(moov: Atom?, bytes: ByteArray, majorBrand: String?): AudioInfo {
    var info = AudioInfo(
        container = majorBrand?.let { MP4_BRANDS[it] ?: it.trim() } ?: "MP4",
    )
    if (moov == null) return info

    val mvhd = findChild(bytes, moov, "mvhd")
    if (mvhd != null) {
        val body = mvhd.start + mvhd.headerBytes
        val version = bytes.getOrElse(body) { 0 }.toInt() and 0xff
        // v0: creation(4) modification(4) timescale(4) duration(4)
        // v1: creation(8) modification(8) timescale(4) duration(8)
        val timescale = readUint32BE(bytes, body + (if (version == 1) 20 else 12))
        val duration = if (version == 1) {
            readUint32BE(bytes, body + 24) * 0x100000000L + readUint32BE(bytes, body + 28)
        } else readUint32BE(bytes, body + 16)
        if (timescale > 0 && duration > 0) {
            info = info.copy(durationSec = duration.toDouble() / timescale)
        }
    }

    for (trak in childAtoms(bytes, moov.start + moov.headerBytes, moov.end)) {
        if (trak.type != "trak") continue
        val mdia = findChild(bytes, trak, "mdia") ?: continue
        val hdlr = findChild(bytes, mdia, "hdlr")
        // Skip video and metadata tracks: this is an audio player.
        if (hdlr != null && readAscii(bytes, hdlr.start + hdlr.headerBytes + 8, 4) != "soun") continue
        val minf = findChild(bytes, mdia, "minf") ?: continue
        val stbl = findChild(bytes, minf, "stbl") ?: continue
        val stsd = findChild(bytes, stbl, "stsd") ?: continue
        val entry = readSampleEntry(bytes, stsd) ?: continue
        info = info.copy(
            codec = MP4_CODECS[entry.format] ?: entry.format.trim(),
            channels = entry.channels,
            channelMode = channelLabel(entry.channels),
            bitsPerSample = entry.bitsPerSample,
            sampleRateHz = entry.sampleRateHz,
        )
        break
    }
    return info
}

// --- Dispatch ---

private fun looksLikeMp4(bytes: ByteArray): Boolean =
    matchesAscii(bytes, 4, "ftyp") || matchesAscii(bytes, 4, "moov") ||
        matchesAscii(bytes, 4, "free") || matchesAscii(bytes, 4, "mdat")

/**
 * Reads what the stream declares. Returns an empty [AudioInfo] for a container
 * this reader does not know rather than guessing from the extension.
 */
fun parseAudioInfo(bytes: ByteArray, options: ParseAudioInfoOptions): AudioInfo {
    if (bytes.isEmpty()) return AudioInfo()
    val base = options.byteOffset

    // A window that does not start at the file's beginning can only be an MP4
    // tail looking for its movie header.
    if (base > 0) {
        return parseMp4(scanForMoov(bytes, options.fileSizeBytes, base), bytes, null)
    }

    if (matchesAscii(bytes, 0, "fLaC")) return parseFlac(bytes) ?: AudioInfo()
    if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WAVE")) return parseWav(bytes) ?: AudioInfo()
    if (matchesAscii(bytes, 0, "OggS")) return parseOgg(bytes) ?: AudioInfo()
    // ftyp is a stronger signature than an MPEG frame sync, so it is checked first.
    if (looksLikeMp4(bytes)) {
        val top = childAtoms(bytes, 0, bytes.size)
        val ftyp = top.firstOrNull { it.type == "ftyp" }
        return parseMp4(
            top.firstOrNull { it.type == "moov" },
            bytes,
            ftyp?.let { readAscii(bytes, it.start + it.headerBytes, 4) },
        )
    }

    // An ID3v2 tag at the head is not audio; skip it before looking for a frame.
    var start = 0
    if (matchesAscii(bytes, 0, "ID3")) {
        start = 10 + (
            ((bytes[6].toInt() and 0x7f) shl 21) or
                ((bytes[7].toInt() and 0x7f) shl 14) or
                ((bytes[8].toInt() and 0x7f) shl 7) or
                (bytes[9].toInt() and 0x7f)
            )
    }
    if (start < bytes.size) {
        parseMpeg(bytes, start, options)?.let { return it }
    }
    return AudioInfo()
}