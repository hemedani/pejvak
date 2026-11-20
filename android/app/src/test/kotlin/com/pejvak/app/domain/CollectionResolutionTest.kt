package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CollectionResolutionTest {

    private fun track(
        id: String,
        folderKey: String? = null,
        folderName: String? = null,
        title: String = id,
        origin: Origin = Origin.Local,
    ) = Track(
        id = id,
        contentHash = "h$id",
        title = title,
        fileUri = "file:///$id.mp3",
        durationSec = 60,
        createdAt = 0,
        updatedAt = 0,
        origin = origin,
        folderKey = folderKey,
        folderName = folderName,
    )

    @Test
    fun `generic folder stays standalone`() {
        val one = track("1", "downloads", "Downloads")
        val two = track("2", "downloads", "Downloads")
        assertNull(resolvePlaybackCollection(one, listOf(one, two), emptyList()))
    }

    @Test
    fun `single track folder stays standalone`() {
        val only = track("1", "lecture", "Lecture 5")
        assertNull(resolvePlaybackCollection(only, listOf(only), emptyList()))
    }

    @Test
    fun `two playable tracks make a folder collection`() {
        val one = track("1", "lecture", "Lecture 5")
        val two = track("2", "lecture", "Lecture 5")
        val resolved = resolvePlaybackCollection(one, listOf(one, two), emptyList())
        assertEquals(ContextType.Folder, resolved?.type)
        assertEquals("lecture", resolved?.key)
        assertEquals("Lecture 5", resolved?.title)
        assertEquals(listOf("1", "2"), resolved?.tracks?.map { it.id })
    }

    @Test
    fun `missing track does not count toward the minimum`() {
        val one = track("1", "lecture", "Lecture 5")
        val missing = track("2", "lecture", "Lecture 5").copy(availability = Availability.Missing)
        assertNull(resolvePlaybackCollection(one, listOf(one, missing), emptyList()))
    }

    @Test
    fun `online collection key wins with cached tracks`() {
        val online = track("o1", title = "Episode 1", origin = Origin.Online)
            .copy(collectionKey = "source:show", collectionTitle = "The Show")
        val sibling = track("o2", title = "Episode 2", origin = Origin.Online)
            .copy(collectionKey = "source:show", collectionTitle = "The Show")
        val resolved = resolvePlaybackCollection(online, emptyList(), listOf(online, sibling))
        assertEquals(ContextType.Online, resolved?.type)
        assertEquals("source:show", resolved?.key)
        assertEquals("The Show", resolved?.title)
        assertEquals(CollectionSort.Source, resolved?.sort)
    }

    @Test
    fun `online with no cache stays standalone`() {
        val online = track("o1", origin = Origin.Online).copy(collectionKey = "source:show")
        assertNull(resolvePlaybackCollection(online, emptyList(), emptyList()))
    }

    @Test
    fun `inherited sort is reused only when valid for the type`() {
        val one = track("1", "lecture", "Lecture 5")
        val two = track("2", "lecture", "Lecture 5")
        val nameDesc = PlaybackConditions(
            collectionSort = CollectionSort.Name,
            collectionSortDirection = SortDirection.Desc,
        )
        val folder = resolvePlaybackCollection(one, listOf(one, two), emptyList(), nameDesc)
        assertEquals(CollectionSort.Name, folder?.sort)
        assertEquals(SortDirection.Desc, folder?.direction)

        val source = PlaybackConditions(collectionSort = CollectionSort.Source)
        val fallback = resolvePlaybackCollection(one, listOf(one, two), emptyList(), source)
        assertEquals(CollectionSort.Folder, fallback?.sort)
        assertEquals(SortDirection.Asc, fallback?.direction)
    }

    @Test
    fun `missing resumed track resolves to the first available item`() {
        val one = track("1", "lecture", "Lecture 5")
        val two = track("2", "lecture", "Lecture 5")
        val ordered = listOf(two, one)
        assertEquals(0, resolveIndex(ordered, "gone"))
        assertEquals(1, resolveIndex(ordered, "1"))
    }
}
