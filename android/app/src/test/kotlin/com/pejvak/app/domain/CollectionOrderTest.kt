package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class CollectionOrderTest {

    private fun track(
        id: String,
        title: String = id,
        durationSec: Int = 100,
        fileName: String? = "$id.mp3",
    ) = Track(
        id = id,
        contentHash = "h$id",
        title = title,
        fileName = fileName,
        durationSec = durationSec,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun ids(tracks: List<Track>) = tracks.map { it.id }

    @Test
    fun `folder options are folder name duration shuffle`() {
        assertEquals(
            listOf(CollectionSort.Folder, CollectionSort.Name, CollectionSort.Duration, CollectionSort.Shuffle),
            collectionSortOptions(ContextType.Folder),
        )
        assertEquals(
            listOf(CollectionSort.Source, CollectionSort.Name, CollectionSort.Duration, CollectionSort.Shuffle),
            collectionSortOptions(ContextType.Online),
        )
        assertEquals(emptyList<CollectionSort>(), collectionSortOptions(ContextType.Playlist))
    }

    @Test
    fun `source keeps the incoming order and desc reverses it`() {
        val tracks = listOf(track("b"), track("a"), track("c"))
        assertEquals(listOf("b", "a", "c"), ids(orderCollectionTracks(tracks, CollectionSort.Source, SortDirection.Asc)))
        assertEquals(listOf("c", "a", "b"), ids(orderCollectionTracks(tracks, CollectionSort.Source, SortDirection.Desc)))
    }

    @Test
    fun `name uses natural numbers and desc reverses`() {
        val tracks = listOf(
            track("10", title = "Episode 10"),
            track("2", title = "Episode 2"),
            track("1", title = "Episode 1"),
        )
        assertEquals(listOf("1", "2", "10"), ids(orderCollectionTracks(tracks, CollectionSort.Name, SortDirection.Asc)))
        assertEquals(listOf("10", "2", "1"), ids(orderCollectionTracks(tracks, CollectionSort.Name, SortDirection.Desc)))
    }

    @Test
    fun `duration orders by seconds and ties break on title then id`() {
        val tracks = listOf(
            track("c", title = "B", durationSec = 30),
            track("b", title = "A", durationSec = 30),
            track("a", title = "A", durationSec = 10),
        )
        assertEquals(
            listOf("a", "b", "c"),
            ids(orderCollectionTracks(tracks, CollectionSort.Duration, SortDirection.Asc)),
        )
    }

    @Test
    fun `shuffle is deterministic with an injected source and ignores direction`() {
        val tracks = listOf(track("1"), track("2"), track("3"), track("4"))
        val asc = orderCollectionTracks(tracks, CollectionSort.Shuffle, SortDirection.Asc) { 0.0 }
        val desc = orderCollectionTracks(tracks, CollectionSort.Shuffle, SortDirection.Desc) { 0.0 }
        assertEquals(listOf("2", "3", "4", "1"), ids(asc))
        assertEquals(ids(asc), ids(desc))
    }

    @Test
    fun `rows follow the plan order and keep excluded rows at the end`() {
        val rows = listOf(track("a"), track("b"), track("c"))
        assertEquals(
            listOf("c", "a", "b"),
            orderCollectionRows(rows, listOf("c", "a", "b")) { it.id }.map { it.id },
        )
        assertEquals(
            listOf("b", "a", "c"),
            orderCollectionRows(rows, listOf("b", "a")) { it.id }.map { it.id },
        )
        assertEquals(rows, orderCollectionRows(rows, emptyList()) { it.id })
    }

    @Test
    fun `folder sort keeps folder natural order and desc reverses it`() {
        val tracks = listOf(
            track("b", fileName = "02.mp3"),
            track("a", fileName = "01.mp3"),
            track("c", fileName = "10.mp3"),
        )
        assertEquals(listOf("a", "b", "c"), ids(orderCollectionTracks(tracks, CollectionSort.Folder, SortDirection.Asc)))
        assertEquals(listOf("c", "b", "a"), ids(orderCollectionTracks(tracks, CollectionSort.Folder, SortDirection.Desc)))
    }
}
