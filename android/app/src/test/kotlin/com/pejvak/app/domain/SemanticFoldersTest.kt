package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SemanticFoldersTest {

    private fun track(
        id: String,
        folderKey: String? = "Lectures/Lecture 05",
        folderName: String? = "Lecture 05",
        availability: Availability = Availability.Present,
        origin: Origin = Origin.Local,
    ) = Track(
        id = id,
        contentHash = "h$id",
        title = "Track $id",
        folderKey = folderKey,
        folderName = folderName,
        availability = availability,
        origin = origin,
        createdAt = 0,
        updatedAt = 0,
    )

    @Test
    fun `generic containers are never collections`() {
        val names = listOf(
            "Downloads", "download", " Music ", "Podcasts", "Audio", "Recordings",
            "Telegram", "WhatsApp", "Ringtones", "Alarms", "Notifications",
            "دانلود", "موسیقی", "پادکست", "صدا", "ضبط",
        )
        names.forEach { name ->
            assertTrue("expected generic: $name", isGenericFolderName(name))
        }
        assertFalse(isGenericFolderName("Lecture 05"))
        assertFalse(isGenericFolderName("Part 2 – Usul"))
    }

    @Test
    fun `storage root is not a collection`() {
        val tracks = listOf(track("1", folderKey = ""), track("2", folderKey = ""))
        assertFalse(isSemanticFolder("", "Internal storage", tracks))
        assertFalse(isSemanticFolder(null, null, tracks))
    }

    @Test
    fun `one playable track is not a collection`() {
        assertFalse(isSemanticFolder("Lectures/Lecture 05", "Lecture 05", listOf(track("1"))))
    }

    @Test
    fun `two playable tracks in a named folder are a collection`() {
        assertTrue(
            isSemanticFolder(
                "Lectures/Lecture 05",
                "Lecture 05",
                listOf(track("1"), track("2")),
            ),
        )
    }

    @Test
    fun `missing and online tracks do not count`() {
        val tracks = listOf(
            track("1"),
            track("2", availability = Availability.Missing),
            track("3", origin = Origin.Online),
        )
        assertFalse(isSemanticFolder("Lectures/Lecture 05", "Lecture 05", tracks))
    }

    @Test
    fun `only the folder's own last segment is classified`() {
        assertTrue(isSemanticFolder("Download/Lecture 05", null, listOf(track("1"), track("2"))))
        assertFalse(isSemanticFolder("Download", null, listOf(track("1"), track("2"))))
        assertFalse(isSemanticFolder("Downloads/", "Downloads", listOf(track("1"), track("2"))))
    }

    @Test
    fun `name normalisation handles case space and trailing separators`() {
        val tracks = listOf(track("1"), track("2"))
        assertFalse(isSemanticFolder("Downloads/", "  downLOADS  ", tracks))
        assertTrue(isSemanticFolder("Lectures/Lecture 05/", "Lecture 05", tracks))
        assertEquals("Lecture 05", folderNameFromKey("Lectures/Lecture 05/"))
    }

    @Test
    fun `resolve returns the folder collection for a semantic folder`() {
        val tracks = listOf(track("1"), track("2"))
        val resolved = resolveFolderCollection(tracks[0], tracks)
        assertEquals("Lectures/Lecture 05", resolved?.key)
        assertEquals("Lecture 05", resolved?.name)
        assertEquals(listOf("1", "2"), resolved?.tracks?.map { it.id })
    }

    @Test
    fun `resolve refuses generic and single track folders`() {
        val generic = listOf(
            track("1", folderKey = "Downloads", folderName = "Downloads"),
            track("2", folderKey = "Downloads", folderName = "Downloads"),
        )
        assertNull(resolveFolderCollection(generic[0], generic))
        assertNull(resolveFolderCollection(track("1"), listOf(track("1"))))
    }
}
