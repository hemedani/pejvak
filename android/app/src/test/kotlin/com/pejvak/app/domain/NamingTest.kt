package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NamingTest {

    @Test
    fun sanitizeReplacesIllegalChars() {
        assertEquals("a-b-c", sanitizeSegment("a/b:c"))
        // Illegal chars become dashes (never empty); fallback is for empty results.
        assertEquals("---", sanitizeSegment("///"))
        assertEquals("Untitled", sanitizeSegment("..."))
        assertEquals("Untitled", sanitizeSegment("\u200E"))
    }

    @Test
    fun sanitizeStripsControlAndRtlMarks() {
        assertEquals("سلام", sanitizeSegment("س\u200Eلام"))
    }

    @Test
    fun sanitizeTruncatesOnWordBoundary() {
        val long = "word ".repeat(40) // 200 chars
        val result = sanitizeSegment(long)
        assertTrue(result.length <= 90)
        assertTrue(!result.endsWith(" "))
    }

    @Test
    fun slugifyFallsBackForPersian() {
        assertEquals("abc-123", slugify("ABC 123", "fb"))
        assertEquals("fb", slugify("تاریخ شیعه", "fb"))
    }

    @Test
    fun collectionFolderKeyAndParse() {
        val key = collectionFolderKey("manahej", "ext1")
        assertEquals("Online/manahej/ext1", key)
        val parsed = parseDownloadedFolderKey(key)!!
        assertEquals("manahej", parsed.sourceId)
        assertEquals(DownloadScopeKind.Collection, parsed.kind)
    }

    @Test
    fun seriesFolderKeyParsesAsSeries() {
        val key = seriesFolderKey("manahej", "ext1", "seed1")
        assertTrue(key.contains("::series::"))
        assertEquals(DownloadScopeKind.Series, parseDownloadedFolderKey(key)!!.kind)
    }

    @Test
    fun parseNonOnlineKeyIsNull() {
        assertNull(parseDownloadedFolderKey("Lectures/Physics"))
    }

    @Test
    fun collectionRelativePathIncludesId() {
        val path = collectionRelativePath("manahej", "تاریخ شیعه", "ext1")
        assertTrue(path.startsWith("Online/manahej/"))
        assertTrue(path.endsWith("(ext1)"))
    }

    @Test
    fun extensionFromUrl() {
        assertEquals("mp3", extensionFromUrl("https://x.com/a.mp3?sig=1"))
        assertEquals("m4a", extensionFromUrl("https://x.com/a.m4a"))
        assertEquals("mp3", extensionFromUrl("https://x.com/signed?token=abc"))
        assertEquals("mp3", extensionFromUrl("https://x.com/a.exe"))
    }

    @Test
    fun trackFileNamePadsAndSanitizes() {
        assertEquals("03 - Title.mp3", trackFileName(3, "Title", "https://x/a.mp3"))
        assertEquals("01 - Track 01.mp3", trackFileName(1, "...", "https://x/a.mp3"))
    }
}