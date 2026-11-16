package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

/** Stream-declaration + embedded-artwork contract, built from synthetic headers. */
class AudioInfoTest {

    private fun be32(v: Long): ByteArray = byteArrayOf(
        ((v shr 24) and 0xff).toByte(), ((v shr 16) and 0xff).toByte(),
        ((v shr 8) and 0xff).toByte(), (v and 0xff).toByte(),
    )

    private fun le32(v: Long): ByteArray = be32(v).reversedArray()
    private fun le16(v: Int): ByteArray = byteArrayOf((v and 0xff).toByte(), ((v shr 8) and 0xff).toByte())
    private fun be16(v: Int): ByteArray = le16(v).reversedArray()
    private fun ascii(s: String): ByteArray = ByteArray(s.length) { s[it].code.toByte() }

    private fun concat(vararg parts: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        parts.forEach { out.write(it) }
        return out.toByteArray()
    }

    private fun box(type: String, body: ByteArray): ByteArray =
        concat(be32((body.size + 8).toLong()), ascii(type), body)

    private fun options(size: Long, offset: Long = 0) =
        ParseAudioInfoOptions(fileName = "test", fileSizeBytes = size, byteOffset = offset)

    // --- MPEG ---

    /** MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo, no CRC. */
    private val mp3Header = byteArrayOf(0xff.toByte(), 0xfb.toByte(), 0x90.toByte(), 0x00)

    @Test
    fun `mpeg cbr duration from file size`() {
        val bytes = concat(mp3Header, ByteArray(2000))
        val info = parseAudioInfo(bytes, options(417L * 100))
        assertEquals("MP3", info.container)
        assertEquals("MPEG-1 Layer III", info.codec)
        assertEquals(128, info.bitrateKbps)
        assertEquals(44100, info.sampleRateHz)
        assertEquals(2, info.channels)
        assertEquals("Stereo", info.channelMode)
        assertFalse(info.variableBitrate)
        // audioBytes = 41700; duration = 41700*8/128000 = 2.60625 s
        assertEquals(2.60625, info.durationSec!!, 0.0001)
    }

    @Test
    fun `mpeg xing header gives frame-count duration`() {
        val frame = ByteArray(417)
        System.arraycopy(mp3Header, 0, frame, 0, 4)
        // Xing at 4 + 32 (MPEG-1 stereo side info).
        System.arraycopy(ascii("Xing"), 0, frame, 36, 4)
        System.arraycopy(be32(3), 0, frame, 40, 4) // flags: frames + bytes
        System.arraycopy(be32(1000), 0, frame, 44, 4)
        System.arraycopy(be32(417_000), 0, frame, 48, 4)
        val info = parseAudioInfo(frame, options(417_000))
        assertTrue(info.variableBitrate)
        assertEquals(1000.0 * 1152 / 44100, info.durationSec!!, 0.0001)
        assertEquals(128, info.bitrateKbps)
    }

    @Test
    fun `mpeg after id3 tag is found`() {
        val tagBody = ByteArray(64)
        val tag = concat(ascii("ID3"), byteArrayOf(3, 0, 0), byteArrayOf(0, 0, 0, 64), tagBody)
        val bytes = concat(tag, mp3Header, ByteArray(500))
        val info = parseAudioInfo(bytes, options(bytes.size.toLong()))
        assertEquals("MPEG-1 Layer III", info.codec)
    }

    // --- WAV ---

    @Test
    fun `wav declares pcm facts`() {
        val fmt = concat(
            le16(1), le16(2), le32(44100), le32(176400), le16(4), le16(16),
        )
        val bytes = concat(
            ascii("RIFF"), le32(0), ascii("WAVE"),
            ascii("fmt "), le32(fmt.size.toLong()), fmt,
            ascii("data"), le32(176400),
        )
        val info = parseAudioInfo(bytes, options(bytes.size.toLong()))
        assertEquals("WAV", info.container)
        assertEquals("PCM", info.codec)
        assertEquals(44100, info.sampleRateHz)
        assertEquals(2, info.channels)
        assertEquals(16, info.bitsPerSample)
        assertEquals(1411, info.bitrateKbps)
        assertEquals(1.0, info.durationSec!!, 0.0001)
    }

    // --- FLAC ---

    private fun flacStreamInfo(sampleRate: Int, channels: Int, bits: Int, totalSamples: Long): ByteArray {
        val packed = (sampleRate.toLong() shl 44) or
            ((channels - 1).toLong() shl 41) or
            ((bits - 1).toLong() shl 36) or
            totalSamples
        val packedBytes = ByteArray(8) { ((packed shr (56 - it * 8)) and 0xff).toByte() }
        return concat(ByteArray(10), packedBytes, ByteArray(16))
    }

    @Test
    fun `flac streaminfo declares duration`() {
        val streamInfo = flacStreamInfo(44100, 2, 16, 88200)
        val bytes = concat(
            ascii("fLaC"),
            byteArrayOf(0x80.toByte(), 0, 0, 34), // last block, type 0, length 34
            streamInfo,
        )
        val info = parseAudioInfo(bytes, options(bytes.size.toLong()))
        assertEquals("FLAC", info.container)
        assertEquals(44100, info.sampleRateHz)
        assertEquals(2, info.channels)
        assertEquals(16, info.bitsPerSample)
        assertEquals(2.0, info.durationSec!!, 0.0001)
    }

    // --- Ogg ---

    @Test
    fun `ogg opus head`() {
        val opusHead = concat(ascii("OpusHead"), byteArrayOf(1, 2), le16(312), le32(48000))
        val bytes = concat(
            ascii("OggS"), ByteArray(22), byteArrayOf(1), // page_segments = 1 at index 26
            byteArrayOf(opusHead.size.toByte()), opusHead,
        )
        val info = parseAudioInfo(bytes, options(bytes.size.toLong()))
        assertEquals("Ogg", info.container)
        assertEquals("Opus", info.codec)
        assertEquals(2, info.channels)
        assertEquals(48000, info.sampleRateHz)
        assertTrue(info.variableBitrate)
    }

    // --- MP4 ---

    private fun mp4WithMoov(durationUnits: Long, timescale: Long): ByteArray {
        val mvhd = box("mvhd", concat(ByteArray(4), ByteArray(8), be32(timescale), be32(durationUnits), ByteArray(80)))
        val sampleEntry = concat(
            be32(36), ascii("mp4a"), ByteArray(6), be16(1),
            ByteArray(8), be16(2), be16(16), be16(0), be16(0), be16(44100), be16(0),
        )
        val stsd = box("stsd", concat(ByteArray(4), be32(1), sampleEntry))
        val stbl = box("stbl", stsd)
        val minf = box("minf", stbl)
        val hdlr = box("hdlr", concat(ByteArray(8), ascii("soun"), ByteArray(12)))
        val mdia = box("mdia", concat(hdlr, minf))
        val trak = box("trak", mdia)
        val moov = box("moov", concat(mvhd, trak))
        val ftyp = box("ftyp", concat(ascii("M4A "), be32(0), ascii("M4A mp42")))
        return concat(ftyp, moov)
    }

    @Test
    fun `mp4 moov declares duration and aac`() {
        val bytes = mp4WithMoov(5000, 1000)
        val info = parseAudioInfo(bytes, options(bytes.size.toLong()))
        assertEquals("M4A", info.container)
        assertEquals("AAC", info.codec)
        assertEquals(2, info.channels)
        assertEquals(16, info.bitsPerSample)
        assertEquals(44100, info.sampleRateHz)
        assertEquals(5.0, info.durationSec!!, 0.0001)
    }

    @Test
    fun `mp4 tail window finds moov`() {
        val full = mp4WithMoov(5000, 1000)
        // Simulate a tail window: the last N bytes of a file whose head is mdat.
        val tailStart = 1000L
        val fileSize = tailStart + full.size
        val info = parseAudioInfo(full, options(fileSize, offset = tailStart))
        assertEquals(5.0, info.durationSec!!, 0.0001)
        assertEquals("AAC", info.codec)
    }

    @Test
    fun `unknown container yields empty info`() {
        val info = parseAudioInfo(ByteArray(64) { 0x55 }, options(64))
        assertNull(info.container)
        assertNull(info.codec)
        assertNull(info.durationSec)
    }
}

class EmbeddedArtworkTest {
    private val jpeg = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte(), 0xe0.toByte(), 0, 0x10, 0x4a, 0x46)

    private fun be32(v: Long): ByteArray = byteArrayOf(
        ((v shr 24) and 0xff).toByte(), ((v shr 16) and 0xff).toByte(),
        ((v shr 8) and 0xff).toByte(), (v and 0xff).toByte(),
    )

    private fun ascii(s: String): ByteArray = ByteArray(s.length) { s[it].code.toByte() }

    private fun concat(vararg parts: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        parts.forEach { out.write(it) }
        return out.toByteArray()
    }

    private fun box(type: String, body: ByteArray): ByteArray =
        concat(be32((body.size + 8).toLong()), ascii(type), body)

    private fun syncSafe(v: Int): ByteArray = byteArrayOf(
        ((v shr 21) and 0x7f).toByte(), ((v shr 14) and 0x7f).toByte(),
        ((v shr 7) and 0x7f).toByte(), (v and 0x7f).toByte(),
    )

    @Test
    fun `id3 apic artwork`() {
        val apicBody = concat(byteArrayOf(3), ascii("image/jpeg"), byteArrayOf(0, 3, 0), jpeg)
        val frame = concat(ascii("APIC"), be32(apicBody.size.toLong()), ByteArray(2), apicBody)
        val tag = concat(ascii("ID3"), byteArrayOf(3, 0, 0), syncSafe(frame.size), frame)
        val picture = readEmbeddedArtwork(tag, ReadArtworkOptions(fileSizeBytes = tag.size.toLong()))!!
        assertEquals("image/jpeg", picture.mimeType)
        assertTrue(picture.data.contentEquals(jpeg))
    }

    @Test
    fun `flac picture block`() {
        val mime = ascii("image/jpeg")
        val pictureBody = concat(
            be32(3), be32(mime.size.toLong()), mime, be32(0),
            be32(100), be32(100), be32(24), be32(0),
            be32(jpeg.size.toLong()), jpeg,
        )
        val bytes = concat(
            ascii("fLaC"),
            byteArrayOf(0x86.toByte(), 0, 0, pictureBody.size.toByte()), // last block, type 6 (PICTURE)
            pictureBody,
        )
        val picture = readEmbeddedArtwork(bytes, ReadArtworkOptions(fileSizeBytes = bytes.size.toLong()))!!
        assertEquals("image/jpeg", picture.mimeType)
        assertEquals(3, picture.pictureType)
    }

    @Test
    fun `mp4 covr in head window`() {
        val data = box("data", concat(be32(13), be32(0), jpeg))
        val covr = box("covr", data)
        val ilst = box("ilst", covr)
        val meta = box("meta", concat(ByteArray(4), ilst))
        val udta = box("udta", meta)
        val moov = box("moov", udta)
        val ftyp = box("ftyp", concat(ascii("M4A "), be32(0)))
        val bytes = concat(ftyp, moov)
        val picture = readEmbeddedArtwork(bytes, ReadArtworkOptions(fileSizeBytes = bytes.size.toLong()))!!
        assertEquals("image/jpeg", picture.mimeType)
        assertEquals(3, picture.pictureType)
    }

    @Test
    fun `mp4 covr in tail window`() {
        val data = box("data", concat(be32(13), be32(0), jpeg))
        val covr = box("covr", data)
        val ilst = box("ilst", covr)
        val meta = box("meta", concat(ByteArray(4), ilst))
        val udta = box("udta", meta)
        val moov = box("moov", udta)
        val tailStart = 5000L
        val picture = readEmbeddedArtwork(
            moov,
            ReadArtworkOptions(byteOffset = tailStart, fileSizeBytes = tailStart + moov.size),
        )!!
        assertEquals("image/jpeg", picture.mimeType)
    }

    @Test
    fun `partial picture is absent not broken`() {
        val apicBody = concat(byteArrayOf(3), ascii("image/jpeg"), byteArrayOf(0, 3, 0), jpeg)
        val frame = concat(ascii("APIC"), be32(apicBody.size.toLong()), ByteArray(2), apicBody)
        val tag = concat(ascii("ID3"), byteArrayOf(3, 0, 0), syncSafe(frame.size), frame)
        val cut = tag.copyOf(tag.size - 2)
        assertNull(readEmbeddedArtwork(cut, ReadArtworkOptions(fileSizeBytes = cut.size.toLong())))
    }

    @Test
    fun `artwork extensions`() {
        assertEquals("png", artworkExtension("image/png"))
        assertEquals("jpg", artworkExtension("image/jpeg"))
        assertEquals("jpg", artworkExtension(null))
        assertEquals("image/webp", artworkMimeType("webp"))
        assertNull(artworkMimeType("tiff"))
    }
}