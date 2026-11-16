package com.pejvak.app.domain.online

import com.pejvak.app.domain.ONLINE_ROOT
import com.pejvak.app.domain.DownloadScopeKind
import com.pejvak.app.domain.collectionFolderKey
import com.pejvak.app.domain.collectionRelativePath
import com.pejvak.app.domain.extensionFromUrl
import com.pejvak.app.domain.formatArchiveDuration
import com.pejvak.app.domain.parseDownloadedFolderKey
import com.pejvak.app.domain.sanitizeSegment
import com.pejvak.app.domain.seriesFolderKey
import com.pejvak.app.domain.seriesRelativePath
import com.pejvak.app.domain.seriesScopeKey
import com.pejvak.app.domain.seriesSeedOf
import com.pejvak.app.domain.slugify
import com.pejvak.app.domain.trackFileName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OnlineTest {
    @Test
    fun `collection keys round-trip and reject malformed input`() {
        val key = collectionKey("archive-fa", "item/123")
        assertEquals("archive-fa:item/123", key)
        assertEquals("archive-fa" to "item/123", parseCollectionKey(key))
        assertNull(parseCollectionKey("no-separator"))
        assertNull(parseCollectionKey(":empty-source"))
        assertNull(parseCollectionKey("empty-external:"))
    }

    @Test
    fun `source languages prefer the explicit list`() {
        val single = OnlineSource(
            id = "x", kind = OnlineSourceKind.Manahej, name = "X", nativeName = "X",
            languageCode = "fa", homepage = "https://example.org", description = "d",
        )
        assertEquals(listOf("fa"), sourceLanguages(single))
        assertEquals(listOf("fa", "en"), sourceLanguages(single.copy(languageCodes = listOf("fa", "en"))))
    }

    @Test
    fun `track counts are singular only at one`() {
        assertEquals("0 tracks", describeTrackCount(0))
        assertEquals("1 track", describeTrackCount(1))
        assertEquals("2 tracks", describeTrackCount(2))
        assertNull(describeKnownTrackCount(0))
        assertEquals("3 tracks", describeKnownTrackCount(3))
    }

    @Test
    fun `archive durations accept seconds and clock strings, reject junk`() {
        assertEquals(90, formatArchiveDuration(90))
        assertEquals(90, formatArchiveDuration(90.4))
        assertEquals(0, formatArchiveDuration(-3))
        assertEquals(65, formatArchiveDuration("1:05"))
        assertEquals(3725, formatArchiveDuration("1:02:05"))
        assertEquals(0, formatArchiveDuration("n/a"))
        assertEquals(0, formatArchiveDuration("1:xx"))
        assertEquals(0, formatArchiveDuration(null))
    }

    @Test
    fun `folder segments strip illegal characters and keep a fallback`() {
        assertEquals("a-b-c", sanitizeSegment("a/b:c"))
        assertEquals("Untitled", sanitizeSegment("   "))
        assertEquals("hello-world", slugify("Hello, World!", "fallback"))
        assertEquals("fallback", slugify("!!!", "fallback"))
        assertEquals("Online/src/Title (ext)", collectionRelativePath("src", "Title", "ext"))
        assertEquals("Online", ONLINE_ROOT)
    }

    @Test
    fun `downloaded folder keys expose the source and series marker`() {
        val collection = parseDownloadedFolderKey("Online/archive-fa/Title (id)")
        assertEquals("archive-fa", collection?.sourceId)
        assertEquals(DownloadScopeKind.Collection, collection?.kind)
        val series = parseDownloadedFolderKey("Online/archive-fa/Title (id)::series::seed")
        assertEquals(DownloadScopeKind.Series, series?.kind)
        assertNull(parseDownloadedFolderKey("Downloads/other"))
    }

    @Test
    fun `language seed is unique and searchable`() {
        val codes = LANGUAGES.map { it.code }
        assertEquals(codes.size, codes.toSet().size)
        assertTrue(LANGUAGES.size >= 40)
        assertEquals("fa", findLanguage("fa")?.code)
        assertEquals(true, findLanguage("fa")?.isRtl)
        assertNull(findLanguage("zz"))
        assertTrue(AVAILABLE_LANGUAGES.all { it.available })
    }

    @Test
    fun `download file names pad the order and take a known extension`() {
        assertEquals("01 - Intro.mp3", trackFileName(1, "Intro", "https://x/a.mp3?sig=1"))
        assertEquals("12 - Talk.m4a", trackFileName(12, "Talk", "https://x/a.m4a"))
        assertEquals("03 - Odd.mp3", trackFileName(3, "Odd", "https://x/signed-tail"))
        assertEquals("mp3", extensionFromUrl("https://x/a.MP3"))
        assertEquals("flac", extensionFromUrl("https://x/a.flac?x=1"))
        assertEquals("mp3", extensionFromUrl("https://x/a.html"))
    }

    @Test
    fun `series folders are siblings of the collection and keyed by seed`() {
        assertEquals("Online/src/ext::series::seed", seriesFolderKey("src", "ext", "seed"))
        assertEquals("Online/src/Title - Show (seed)", seriesRelativePath("src", "Title", "ext", "Show", "seed"))
        assertEquals("seed", seriesSeedOf(seriesScopeKey("src:ext", "seed")))
        assertNull(seriesSeedOf("src:ext"))
    }

    @Test
    fun `collection kind labels cover every source kind`() {
        OnlineSourceKind.entries.forEach { kind ->
            assertTrue("missing label for $kind", kind in COLLECTION_KIND_LABELS.keys)
        }
    }
}
