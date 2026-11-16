package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class RecentPlaysTest {
    private fun track(id: String) = Track(
        id = id,
        contentHash = "hash-$id",
        title = id,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun folder(key: String) = Folder(key = key, name = key, addedAt = 0)

    private fun playlist(id: String) = Playlist(id = id, title = id, createdAt = 0, updatedAt = 0)

    private fun session(
        id: String,
        trackId: String,
        startedAt: Long,
        contextType: ContextType? = null,
        contextKey: String? = null,
    ) = Session(
        id = id,
        trackId = trackId,
        contentHash = "hash-$trackId",
        startedAt = startedAt,
        createdAt = startedAt,
        updatedAt = startedAt,
        contextType = contextType,
        contextKey = contextKey,
        stretchId = "s",
    )

    @Test
    fun `collections dedupe and keep their newest position`() {
        val plays = buildRecentPlays(
            sessions = listOf(
                session("s3", "t3", 3000, ContextType.Folder, "F"),
                session("s2", "t2", 2000, ContextType.Playlist, "P"),
                session("s1", "t1", 1000, ContextType.Folder, "F"),
            ),
            folders = listOf(folder("F")),
            playlists = listOf(playlist("P")),
            tracks = listOf(track("t1"), track("t2"), track("t3")),
            limit = 12,
        )
        assertEquals(listOf("folder:F", "playlist:P"), plays.map { recentPlayKey(it) })
        assertEquals(3000, plays[0].lastPlayedAt)
    }

    @Test
    fun `a deleted collection falls through to its track`() {
        val plays = buildRecentPlays(
            sessions = listOf(session("s1", "t1", 1000, ContextType.Folder, "gone")),
            folders = emptyList(),
            playlists = emptyList(),
            tracks = listOf(track("t1")),
            limit = 12,
        )
        assertEquals(listOf("track:t1"), plays.map { recentPlayKey(it) })
    }

    @Test
    fun `a bare track dedupes and the limit stops the walk`() {
        val plays = buildRecentPlays(
            sessions = listOf(
                session("s1", "t1", 3000),
                session("s2", "t1", 2000),
                session("s3", "t2", 1000),
            ),
            folders = emptyList(),
            playlists = emptyList(),
            tracks = listOf(track("t1"), track("t2")),
            limit = 1,
        )
        assertEquals(listOf("track:t1"), plays.map { recentPlayKey(it) })
    }

    @Test
    fun `when copy is short and true`() {
        val now = 1_000_000_000_000L
        assertEquals("Just now", describeRecentWhen(now - 30_000, now))
        assertEquals("5m ago", describeRecentWhen(now - 5 * 60_000, now))
        assertEquals("3h ago", describeRecentWhen(now - 3 * 3_600_000, now))
        assertEquals("Yesterday", describeRecentWhen(now - 25 * 3_600_000, now))
        assertEquals("3d ago", describeRecentWhen(now - 3 * 86_400_000, now))
    }
}
