package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FilenameTagsTest {
    @Test
    fun `leading track number`() {
        val tags = readFilenameTags("03 - Thermodynamics.mp3")
        assertEquals("Thermodynamics", tags.title)
        assertEquals(3, tags.trackNumber)
        assertNull(tags.year)
    }

    @Test
    fun `underscore and dot separators`() {
        assertEquals("Thermodynamics", readFilenameTags("03_Thermodynamics.mp3").title)
        assertEquals("Thermodynamics", readFilenameTags("03. Thermodynamics.mp3").title)
    }

    @Test
    fun `trailing track number`() {
        val tags = readFilenameTags("Thermodynamics - 03.mp3")
        assertEquals("Thermodynamics", tags.title)
        assertEquals(3, tags.trackNumber)
    }

    @Test
    fun `dated prefix`() {
        val tags = readFilenameTags("2024-03-12 Lecture 4.mp3")
        assertEquals("Lecture 4", tags.title)
        assertEquals(2024, tags.year)
        assertNull(tags.trackNumber)
    }

    @Test
    fun `compact dated prefix`() {
        val tags = readFilenameTags("20240312 Foo.mp3")
        assertEquals("Foo", tags.title)
        assertEquals(2024, tags.year)
    }

    @Test
    fun `date-only name keeps the date as title`() {
        val tags = readFilenameTags("2024-03-12.mp3")
        assertEquals("2024-03-12", tags.title)
        assertEquals(2024, tags.year)
    }

    @Test
    fun `invalid month day is not a date`() {
        val tags = readFilenameTags("2024-13-40 Foo.mp3")
        assertNull(tags.year)
    }

    @Test
    fun `year-like leading number is not a track number`() {
        val tags = readFilenameTags("1984 Part One.mp3")
        assertNull(tags.trackNumber)
        assertEquals("1984 Part One", tags.title)
    }

    @Test
    fun `plain name`() {
        val tags = readFilenameTags("Some Lecture.mp3")
        assertEquals("Some Lecture", tags.title)
        assertNull(tags.trackNumber)
    }

    @Test
    fun `underscores become spaces`() {
        assertEquals("Some Lecture", readFilenameTags("Some_Lecture.mp3").title)
    }

    @Test
    fun `leading dot is part of the name`() {
        // stripExtension keeps a leading dot, so the stem is ".mp3" — same as RN.
        assertEquals(".mp3", readFilenameTags(".mp3").title)
        assertNull(readFilenameTags("").title)
    }

    @Test
    fun `stripExtension keeps leading dot`() {
        assertEquals(".hidden", stripExtension(".hidden"))
        assertEquals("name", stripExtension("name.mp3"))
    }
}

class ImportMetadataTest {
    @Test
    fun `tags win over filename`() {
        val meta = resolveTrackMetadata(
            "03 - Name.mp3", 600,
            AudioTags(title = "Tagged Title", artist = "Author", album = "Album", trackNumber = 9, discNumber = 2, year = 2020),
        )
        assertEquals("Tagged Title", meta.title)
        assertEquals("Author", meta.author)
        assertEquals("Album", meta.album)
        assertEquals(9, meta.trackNumber)
        assertEquals(2, meta.discNumber)
        assertEquals(2020, meta.year)
        assertFalse(meta.isAudiobook)
    }

    @Test
    fun `filename fills gaps the tags leave`() {
        val meta = resolveTrackMetadata("03 - Name.mp3", 600, AudioTags(title = "Tagged"))
        assertEquals("Tagged", meta.title)
        assertEquals(3, meta.trackNumber)
    }

    @Test
    fun `untagged file falls back to filename`() {
        val meta = resolveTrackMetadata("03 - Thermodynamics.mp3", 600, AudioTags())
        assertEquals("Thermodynamics", meta.title)
        assertEquals(3, meta.trackNumber)
    }

    @Test
    fun `m4b is always audiobook`() {
        assertTrue(resolveTrackMetadata("book.m4b", 60, AudioTags()).isAudiobook)
    }

    @Test
    fun `long duration is audiobook`() {
        assertTrue(resolveTrackMetadata("lecture.mp3", 30 * 60, AudioTags()).isAudiobook)
        assertFalse(resolveTrackMetadata("song.mp3", 30 * 60 - 1, AudioTags()).isAudiobook)
    }

    @Test
    fun `audio formats`() {
        assertTrue(isAudioFileName("a.mp3"))
        assertTrue(isAudioFileName("a.M4B"))
        assertFalse(isAudioFileName("cover.jpg"))
        assertFalse(isAudioFileName("noextension"))
        assertEquals("audio/mpeg", mimeTypeForFileName("a.mp3"))
        assertEquals("audio/mp4", mimeTypeForFileName("a.m4b"))
        assertNull(mimeTypeForFileName("a.txt"))
        assertNull(fileExtension(".hidden"))
        assertEquals("mp3", fileExtension("a.b.MP3"))
    }

    @Test
    fun `stream detection is scheme-based`() {
        assertTrue(isStreamUri("https://x/y.mp3"))
        assertTrue(isStreamUri("http://x/y.mp3"))
        assertFalse(isStreamUri("file:///storage/http notes.mp3"))
        assertFalse(isStreamUri("content://media/audio/1"))
    }
}

class Id3GenresTest {
    @Test
    fun `plain name passes through`() {
        assertEquals("Trance", resolveGenre("Trance"))
        assertEquals("Trance", resolveGenre("  Trance  "))
    }

    @Test
    fun `numeric references resolve`() {
        // Only parenthesised references resolve; a bare number is free text (RN parity).
        assertEquals("31", resolveGenre("31"))
        assertEquals("Trance", resolveGenre("(31)"))
        assertEquals("Audiobook", resolveGenre("(183)"))
    }

    @Test
    fun `refinement appends free text`() {
        assertEquals("Trance / Goa Trance", resolveGenre("(31)Goa Trance"))
        assertEquals("Remix", resolveGenre("(RX)"))
        assertEquals("Cover", resolveGenre("(CR)"))
    }

    @Test
    fun `unresolvable returns trimmed or null`() {
        assertNull(resolveGenre(""))
        // An unresolved reference falls back to the raw trimmed value (RN parity).
        assertEquals("(999)", resolveGenre("(999)"))
        assertEquals("999", resolveGenre("999"))
    }

    @Test
    fun `catalogue size`() {
        assertEquals(192, ID3_GENRE_COUNT)
    }
}