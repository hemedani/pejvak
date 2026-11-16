package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** ID3v2 reader contract — synthetic frames built the same way the RN tests build them. */
class AudioTagsTest {

    private fun concat(vararg parts: ByteArray): ByteArray {
        val out = ByteArray(parts.sumOf { it.size })
        var offset = 0
        for (part in parts) {
            System.arraycopy(part, 0, out, offset, part.size)
            offset += part.size
        }
        return out
    }

    private fun syncSafeBytes(value: Int): ByteArray = byteArrayOf(
        ((value shr 21) and 0x7f).toByte(), ((value shr 14) and 0x7f).toByte(),
        ((value shr 7) and 0x7f).toByte(), (value and 0x7f).toByte(),
    )

    private fun bigEndian32(value: Int): ByteArray = byteArrayOf(
        ((value shr 24) and 0xff).toByte(), ((value shr 16) and 0xff).toByte(),
        ((value shr 8) and 0xff).toByte(), (value and 0xff).toByte(),
    )

    private fun frameWith(id: String, body: ByteArray, major: Int = 3): ByteArray {
        val idLength = if (major == 2) 3 else 4
        val headerLength = if (major == 2) 6 else 10
        val frame = ByteArray(headerLength + body.size)
        for (i in 0 until idLength) frame[i] = id[i].code.toByte()
        when (major) {
            2 -> {
                frame[3] = ((body.size shr 16) and 0xff).toByte()
                frame[4] = ((body.size shr 8) and 0xff).toByte()
                frame[5] = (body.size and 0xff).toByte()
            }
            4 -> System.arraycopy(syncSafeBytes(body.size), 0, frame, 4, 4)
            else -> System.arraycopy(bigEndian32(body.size), 0, frame, 4, 4)
        }
        System.arraycopy(body, 0, frame, headerLength, body.size)
        return frame
    }

    private fun textFrame(id: String, text: String, major: Int = 3, encoding: Int = 3): ByteArray {
        val payload = if (encoding == 0) ByteArray(text.length) { text[it].code.toByte() }
        else text.toByteArray(Charsets.UTF_8)
        return frameWith(id, concat(byteArrayOf(encoding.toByte()), payload), major)
    }

    private fun tagWith(vararg frames: ByteArray, major: Int = 3, flags: Int = 0): ByteArray {
        val body = concat(*frames)
        val header = concat(
            byteArrayOf(0x49, 0x44, 0x33, major.toByte(), 0, flags.toByte()),
            syncSafeBytes(body.size),
        )
        return concat(header, body)
    }

    private val jpegBytes = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte(), 0xe0.toByte(), 0, 0x10, 0x4a, 0x46)
    private val pngBytes = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2)

    private fun pictureFrame(id: String, mime: String, data: ByteArray = jpegBytes, type: Int = 3, description: String = "", major: Int = 3): ByteArray {
        val isV22 = major == 2
        val mimeBytes = if (isV22) ByteArray(3) { mime[it].uppercaseChar().code.toByte() }
        else mime.toByteArray(Charsets.UTF_8)
        val body = concat(
            byteArrayOf(3),
            mimeBytes,
            if (isV22) ByteArray(0) else byteArrayOf(0),
            byteArrayOf(type.toByte()),
            description.toByteArray(Charsets.UTF_8),
            byteArrayOf(0),
            data,
        )
        return frameWith(id, body, major)
    }

    private fun describedFrame(id: String, language: String, description: String, text: String, major: Int = 3): ByteArray =
        frameWith(
            id,
            concat(
                byteArrayOf(3),
                ByteArray(language.length) { language[it].code.toByte() },
                description.toByteArray(Charsets.UTF_8),
                byteArrayOf(0),
                text.toByteArray(Charsets.UTF_8),
            ),
            major,
        )

    @Test
    fun `no header yields empty bundle`() {
        val bundle = readAudioTagBundle(ByteArray(64))
        assertNull(bundle.tagVersion)
        assertEquals(0, bundle.frameCount)
        assertNull(bundle.tags.title)
        assertFalse(hasId3Header(ByteArray(64)))
        assertNull(readId3TagSize("not a tag".toByteArray()))
    }

    @Test
    fun `reads core text frames v2_3`() {
        val bytes = tagWith(
            textFrame("TIT2", "Chapter One"),
            textFrame("TPE1", "Author Name"),
            textFrame("TALB", "The Book"),
            textFrame("TRCK", "3/12"),
            textFrame("TPOS", "1/2"),
            textFrame("TYER", "2024"),
        )
        val tags = readAudioTags(bytes)
        assertEquals("Chapter One", tags.title)
        assertEquals("Author Name", tags.artist)
        assertEquals("The Book", tags.album)
        assertEquals(3, tags.trackNumber)
        assertEquals(1, tags.discNumber)
        assertEquals(2024, tags.year)
    }

    @Test
    fun `v2_4 syncsafe frame sizes and TDRC timestamp`() {
        val bytes = tagWith(
            textFrame("TIT2", "Movement", major = 4),
            textFrame("TDRC", "2024-03-12T10:00", major = 4),
            textFrame("MVNM", "Chapter 4", major = 4),
            textFrame("MVIN", "4", major = 4),
            major = 4,
        )
        val bundle = readAudioTagBundle(bytes)
        assertEquals("ID3v2.4", bundle.tagVersion)
        assertEquals("Movement", bundle.tags.title)
        assertEquals(2024, bundle.tags.year)
        assertEquals("Chapter 4", bundle.tags.movement)
        assertEquals(4, bundle.tags.movementNumber)
    }

    @Test
    fun `v2_2 three-char ids`() {
        val bytes = tagWith(
            textFrame("TT2", "Old Tag", major = 2),
            textFrame("TP1", "Old Artist", major = 2),
            textFrame("TRK", "7", major = 2),
            major = 2,
        )
        val tags = readAudioTags(bytes)
        assertEquals("Old Tag", tags.title)
        assertEquals("Old Artist", tags.artist)
        assertEquals(7, tags.trackNumber)
    }

    @Test
    fun `latin1 and utf16 encodings`() {
        val latin = frameWith("TIT2", concat(byteArrayOf(0), "Café".toByteArray(Charsets.ISO_8859_1)))
        // UTF-16LE with BOM.
        val utf16Payload = "کتاب".toByteArray(Charsets.UTF_16LE)
        val utf16 = frameWith("TPE1", concat(byteArrayOf(1, 0xff.toByte(), 0xfe.toByte()), utf16Payload))
        val tags = readAudioTags(tagWith(latin, utf16))
        assertEquals("Café", tags.title)
        assertEquals("کتاب", tags.artist)
    }

    @Test
    fun `extended details and genre resolution`() {
        val bytes = tagWith(
            textFrame("TCOM", "Composer"),
            textFrame("TCON", "(31)Goa Trance"),
            textFrame("TPUB", "Publisher"),
            textFrame("TSRC", "IR1234567890"),
            textFrame("TBPM", "120"),
            describedFrame("COMM", "eng", "", "A comment"),
            describedFrame("USLT", "eng", "", "Lyrics line"),
        )
        val details = readAudioTagBundle(bytes).details
        assertEquals("Composer", details.composer)
        assertEquals("Trance / Goa Trance", details.genre)
        assertEquals("Publisher", details.publisher)
        assertEquals("IR1234567890", details.isrc)
        assertEquals(120, details.bpm)
        assertEquals("A comment", details.comment)
        assertEquals("Lyrics line", details.lyrics)
        assertEquals("eng", details.language)
    }

    @Test
    fun `APIC picture decoded and sniffed`() {
        val bytes = tagWith(pictureFrame("APIC", "image/jpeg", description = "Cover"))
        val picture = readAudioTagBundle(bytes).picture!!
        assertEquals("image/jpeg", picture.mimeType)
        assertEquals(3, picture.pictureType)
        assertTrue(picture.data.contentEquals(jpegBytes))
    }

    @Test
    fun `PIC v2_2 picture and wrong mime corrected by sniff`() {
        val bytes = tagWith(pictureFrame("PIC", "png", data = pngBytes, major = 2), major = 2)
        val picture = readAudioTagBundle(bytes).picture!!
        assertEquals("image/png", picture.mimeType)
    }

    @Test
    fun `url picture is rejected`() {
        val bytes = tagWith(pictureFrame("APIC", "-->"))
        assertNull(readAudioTagBundle(bytes).picture)
    }

    @Test
    fun `truncated tag reports truncated and drops overflowing picture`() {
        val full = tagWith(textFrame("TIT2", "Title"), pictureFrame("APIC", "image/jpeg"))
        val cut = full.copyOf(full.size - 4)
        val bundle = readAudioTagBundle(cut)
        assertTrue(bundle.truncated)
        assertNull(bundle.picture)
        assertEquals("Title", bundle.tags.title)
    }

    @Test
    fun `unsynchronised tag is de-unsynchronised`() {
        // Raw payload carries FF 00 padding; the frame size declares the
        // post-deunsynchronisation length (3), as a real unsync tag does.
        val rawPayload = byteArrayOf(0, 0xff.toByte(), 0x00, 0x41)
        val header = ByteArray(10)
        "TIT2".forEachIndexed { i, c -> header[i] = c.code.toByte() }
        System.arraycopy(bigEndian32(3), 0, header, 4, 4)
        val bytes = tagWith(concat(header, rawPayload), flags = 0x80)
        val tags = readAudioTags(bytes)
        assertEquals("\u00ffA", tags.title)
    }

    @Test
    fun `padding stops the walk`() {
        val bytes = tagWith(textFrame("TIT2", "Title"), ByteArray(32))
        val bundle = readAudioTagBundle(bytes)
        assertEquals(1, bundle.frameCount)
        assertEquals("Title", bundle.tags.title)
    }

    @Test
    fun `mime sniffing`() {
        assertEquals("image/jpeg", sniffImageMime(jpegBytes))
        assertEquals("image/png", sniffImageMime(pngBytes))
        assertNull(sniffImageMime(ByteArray(4)))
    }

    @Test
    fun `first value wins for multi-value frames`() {
        val body = concat(byteArrayOf(3), "First\u0000Second".toByteArray(Charsets.UTF_8))
        val tags = readAudioTags(tagWith(frameWith("TPE1", body)))
        assertEquals("First", tags.artist)
    }
}