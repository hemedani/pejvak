package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.security.MessageDigest

class ContentHashTest {

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    @Test
    fun emptyChunkSizeZeroIsSha256OfZero() {
        // SHA-256("0") — a well-known vector.
        assertEquals(
            "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
            contentHashFromChunk(ByteArray(0), 0),
        )
    }

    @Test
    fun hashInputIsChunkThenDecimalSize() {
        val chunk = byteArrayOf(1, 2, 3)
        val input = buildHashInput(chunk, 1234)
        assertEquals(3 + 4, input.size)
        assertEquals(1.toByte(), input[0])
        assertEquals("1234", String(input, 3, 4, Charsets.UTF_8))
    }

    @Test
    fun matchesIndependentSha256() {
        val chunk = "hello world".toByteArray()
        val expected = sha256Hex(chunk + "999".toByteArray())
        assertEquals(expected, contentHashFromChunk(chunk, 999))
    }

    @Test
    fun sizeChangesIdentity() {
        val chunk = "same bytes".toByteArray()
        assertNotEquals(contentHashFromChunk(chunk, 100), contentHashFromChunk(chunk, 101))
    }

    @Test
    fun onlineIdentityFormat() {
        assertEquals("online:manahej:abc123", onlineIdentity("manahej", "abc123"))
    }

    @Test
    fun onlineHashIsSha256OfIdentity() {
        val expected = sha256Hex("online:archive-fa:xyz".toByteArray())
        assertEquals(expected, hashOnlineIdentity("archive-fa", "xyz"))
    }

    @Test
    fun toHexPads() {
        assertEquals("00ff10", toHex(byteArrayOf(0, 0xff.toByte(), 0x10)))
    }
}