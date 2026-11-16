package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaylistsTest {
    private fun items(vararg ids: String) = ids.mapIndexed { index, id -> PlaylistItem(id, index) }

    @Test
    fun `adding skips present tracks and duplicates in the batch`() {
        val result = addTracksToPlaylist(items("a", "b"), listOf("b", "c", "c", "d"))
        assertEquals(listOf("a", "b", "c", "d"), orderedTrackIds(result))
        assertEquals(listOf(0, 1, 2, 3), result.map { it.order })
    }

    @Test
    fun `adding nothing still normalizes order`() {
        val sparse = listOf(PlaylistItem("a", 4), PlaylistItem("b", 9))
        assertEquals(listOf(0, 1), addTracksToPlaylist(sparse, listOf("a")).map { it.order })
    }

    @Test
    fun `removing keeps the remaining order contiguous`() {
        val result = removeTracksFromPlaylist(items("a", "b", "c", "d"), listOf("b", "d"))
        assertEquals(listOf("a", "c"), orderedTrackIds(result))
        assertEquals(listOf(0, 1), result.map { it.order })
    }

    @Test
    fun `moving reorders and normalizes`() {
        assertEquals(
            listOf("b", "c", "a"),
            orderedTrackIds(movePlaylistItem(items("a", "b", "c"), 0, 2)),
        )
        assertEquals(
            listOf("a", "b", "c"),
            orderedTrackIds(movePlaylistItem(items("a", "b", "c"), 9, 0)),
        )
    }

    @Test
    fun `resolving drops tracks no longer in the library but keeps order`() {
        val tracks = listOf(
            Track(id = "b", contentHash = "hb", title = "b", createdAt = 0, updatedAt = 0),
            Track(id = "a", contentHash = "ha", title = "a", createdAt = 0, updatedAt = 0),
        )
        val result = resolvePlaylistTracks(items("a", "gone", "b"), tracks)
        assertEquals(listOf("a", "b"), result.map { it.id })
    }
}
