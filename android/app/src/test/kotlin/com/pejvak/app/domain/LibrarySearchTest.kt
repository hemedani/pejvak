package com.pejvak.app.domain

import com.pejvak.app.core.foldQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LibrarySearchTest {
    private fun track(id: String, title: String, overrides: Track.() -> Track = { this }) =
        Track(
            id = id,
            contentHash = "hash-$id",
            title = title,
            createdAt = 0,
            updatedAt = 0,
        ).overrides()

    private fun folder(key: String, name: String) =
        Folder(key = key, name = name, addedAt = 0)

    private fun playlist(id: String, title: String, description: String? = null) =
        Playlist(id = id, title = title, description = description, createdAt = 0, updatedAt = 0)

    private fun names(fields: List<SearchField>) = fields.map { it.field }

    @Test
    fun `exact beats prefix beats word beats substring`() {
        val items = listOf("xabx", "ab", "a ab", "abc")
        val hits = searchItems(items, foldQuery("ab")) { listOf(SearchField(LibraryField.Title, it)) }
        assertEquals(listOf("ab", "abc", "a ab", "xabx"), hits.map { it.item })
        assertEquals(
            listOf(MatchQuality.Exact, MatchQuality.Prefix, MatchQuality.Word, MatchQuality.Substring),
            hits.map { it.quality },
        )
    }

    @Test
    fun `every term must hit and the best term sets quality`() {
        val items = listOf("the history of iran", "history", "iran history")
        val hits = searchItems(items, foldQuery("hist iran")) { listOf(SearchField(LibraryField.Title, it)) }
        assertEquals(listOf("iran history", "the history of iran"), hits.map { it.item })
        assertEquals(
            listOf(MatchQuality.Prefix, MatchQuality.Word),
            hits.map { it.quality },
        )
        assertTrue(searchItems(items, foldQuery("hist greece")) { listOf(SearchField(LibraryField.Title, it)) }.isEmpty())
    }

    @Test
    fun `title wins ties and keeps highlight ranges`() {
        val row = track("t", "Physics", { copy(author = "Physics") })
        val hits = searchItems(listOf(row), foldQuery("physics"), titleField = LibraryField.Title) {
            trackSearchFields(it)
        }
        assertEquals(1, hits.size)
        assertEquals(LibraryField.Title, hits.single().field)
        assertEquals(listOf(0 until 7), hits.single().ranges)
    }

    @Test
    fun `non-title hit reports the field value and no ranges`() {
        val row = track("t", "Untitled", { copy(author = "Maryam") })
        val hit = searchItems(listOf(row), foldQuery("maryam"), titleField = LibraryField.Title) {
            trackSearchFields(it)
        }.single()
        assertEquals(LibraryField.Author, hit.field)
        assertEquals("Maryam", hit.value)
        assertTrue(hit.ranges.isEmpty())
    }

    @Test
    fun `persian spellings fold before comparing`() {
        val row = track("t", "ماجراي شيعه")
        val hits = searchItems(listOf(row), foldQuery("ماجرای شیعه"), titleField = LibraryField.Title) {
            trackSearchFields(it)
        }
        assertEquals(1, hits.size)
        assertEquals(listOf(0 until 6, 7 until 11), hits.single().ranges)
    }

    @Test
    fun `track fields include the file name, folder, path and collection title`() {
        val bare = track("t1", "Track 04", { copy(fileName = "فصل چهارم.mp3") })
        assertTrue(names(trackSearchFields(bare)).contains(LibraryField.FileName))

        val filed = track("t2", "Physics", {
            copy(folderKey = "Lectures/Physics", folderName = "Physics")
        })
        assertTrue(names(trackSearchFields(filed)).containsAll(listOf(LibraryField.Folder, LibraryField.Path)))

        val picked = track("t3", "Lesson", {
            copy(sourcePath = "/storage/emulated/0/Download/درس.mp3")
        })
        assertEquals(
            "/storage/emulated/0/Download/درس.mp3",
            trackSearchFields(picked).first { it.field == LibraryField.Path }.value,
        )

        val streamed = track("t4", "Shia history", {
            copy(
                origin = Origin.Online,
                sourceId = "manahej",
                externalId = "900",
                collectionKey = "manahej:190",
                collectionTitle = "تاریخ شیعه",
                streamUrl = "https://cdn.example/audio.mp3?token=abc",
            )
        })
        assertEquals(
            "تاریخ شیعه",
            trackSearchFields(streamed).first { it.field == LibraryField.Folder }.value,
        )
        assertTrue(trackSearchFields(streamed).none { it.value?.contains("token") == true })
    }

    @Test
    fun `index drops absent and empty fields`() {
        val bare = track("t", "آهنگ", { copy(fileName = "song.mp3") })
        val entry = createSearchIndex(listOf(bare), LibraryField.Title) { trackSearchFields(it) }.single()
        assertEquals(listOf(LibraryField.Title, LibraryField.FileName), entry.fields.map { it.field })

        val root = folder("", "Internal storage")
        val rootEntry = createSearchIndex(listOf(root), LibraryField.Title) { folderSearchFields(it) }.single()
        assertEquals(listOf(LibraryField.Title), rootEntry.fields.map { it.field })
    }

    @Test
    fun `folder and playlist fields search the text the listener can see`() {
        val nested = folder("Lectures/Physics", "فیزیک")
        assertEquals(
            listOf(LibraryField.Title, LibraryField.Path),
            names(folderSearchFields(nested)),
        )
        val hit = searchItems(listOf(nested), foldQuery("فیزیک"), titleField = LibraryField.Title) {
            folderSearchFields(it)
        }.single()
        assertEquals(listOf(0 until 5), hit.ranges)

        val notes = playlist("p1", "برای شب", "آرام و بی‌کلام")
        assertEquals(
            listOf(LibraryField.Title, LibraryField.Description),
            names(playlistSearchFields(notes)),
        )
    }

    @Test
    fun `empty query returns no hits and empty text never matches`() {
        val row = track("t", "Physics")
        assertTrue(searchItems(listOf(row), emptyList(), titleField = LibraryField.Title) { trackSearchFields(it) }.isEmpty())
        assertNull(matchOne("Physics", listOf("")))
    }
}
