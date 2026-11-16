package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class TrackStatsTest {
    private fun session(
        id: String,
        startedAt: Long,
        endedAt: Long?,
        listened: Int,
        completed: Boolean = false,
        interrupted: Boolean = false,
        speed: Double = 1.0,
    ) = Session(
        id = id, trackId = "t", contentHash = "h", startedAt = startedAt, endedAt = endedAt,
        durationListenedSec = listened, playbackSpeed = speed, completed = completed,
        interrupted = interrupted, createdAt = startedAt, updatedAt = startedAt, stretchId = "s",
    )

    @Test
    fun `only finalized sessions count as plays`() {
        val stats = computeTrackStats(
            listOf(
                session("a", 1000, 2000, 60, completed = true),
                session("b", 3000, null, 10),
            ),
            listOf(
                Annotation("n1", trackId = "t", contentHash = "h", positionSec = 5, text = "x", createdAt = 1, updatedAt = 1),
            ),
        )
        assertEquals(1, stats.playCount)
        assertEquals(60, stats.totalListenTimeSec)
        assertEquals(3000L, stats.lastPlayedAt)
        assertEquals(1.0, stats.completionRate, 0.0001)
        assertEquals(1, stats.annotationCount)
    }

    @Test
    fun `empty stats`() {
        val stats = computeTrackStats(emptyList(), emptyList())
        assertEquals(0, stats.playCount)
        assertNull(stats.lastPlayedAt)
        assertEquals(0.0, stats.completionRate, 0.0001)
    }

    @Test
    fun `session summary shape`() {
        val utc = ZoneId.of("UTC")
        val day1 = 1_700_000_000_000L
        val day2 = day1 + 86_400_000L
        val summary = summariseSessions(
            listOf(
                session("a", day1, day1 + 60_000, 60, completed = true, speed = 1.0),
                session("b", day1 + 120_000, day1 + 180_000, 120, interrupted = true, speed = 1.5),
                session("c", day2, null, 30, speed = 1.0),
            ),
        )
        assertEquals(2, summary.finishedCount)
        assertEquals(1, summary.completedCount)
        assertEquals(1, summary.interruptedCount)
        assertEquals(1, summary.openCount)
        assertEquals(180, summary.totalListenedSec)
        assertEquals(120, summary.longestSec)
        assertEquals(90, summary.averageSec)
        assertEquals(day1, summary.firstStartedAt)
        assertEquals(day2, summary.lastActivityAt)
        assertEquals(2, summary.daysListened)
        assertEquals(listOf(1.0, 1.5), summary.speeds)
        // dayKey sanity for the zone used above.
        assertEquals("2023-11-14", dayKey(day1, utc))
    }
}

class MissingTest {
    private fun track(id: String, folderKey: String?, folderName: String? = null) = Track(
        id = id, contentHash = "h$id", title = "Track $id", createdAt = 0, updatedAt = 0,
        folderKey = folderKey, folderName = folderName, availability = Availability.Missing,
    )

    @Test
    fun `groups by folder with no-folder last`() {
        val groups = groupByFolder(
            listOf(
                MissingTrack(track("1", null), 0, 0, 0),
                MissingTrack(track("2", "B"), 0, 0, 0),
                MissingTrack(track("3", "A"), 0, 0, 0),
                MissingTrack(track("4", "A"), 0, 0, 0),
            ),
        )
        assertEquals(listOf("A", "B", "No folder"), groups.map { it.folderName })
        assertEquals(2, groups[0].tracks.size)
    }

    @Test
    fun `folder name falls back to key`() {
        val groups = groupByFolder(listOf(MissingTrack(track("1", "Lectures/Physics"), 0, 0, 0)))
        assertEquals("Lectures/Physics", groups.single().folderName)
    }

    @Test
    fun `stake describes only what is recorded`() {
        assertNull(describeStake(0, 0, 0))
        assertEquals("1 session", describeStake(1, 0, 0))
        assertEquals("2 sessions · 2m listened · 1 note", describeStake(2, 120, 1))
    }

    @Test
    fun `summary headline`() {
        assertEquals("Every file is where it should be.", summariseMissing(emptyList()))
        assertEquals("1 file missing", summariseMissing(listOf(MissingTrack(track("1", null), 0, 0, 0))))
        assertEquals(
            "2 files missing · 2m of listening at stake",
            summariseMissing(
                listOf(
                    MissingTrack(track("1", null), 1, 60, 0),
                    MissingTrack(track("2", null), 1, 60, 0),
                ),
            ),
        )
    }
}

class MediaFoldersScanTest {
    @Test
    fun `deriveFolderKey strips storage roots`() {
        assertEquals("Music/Lectures", deriveFolderKey("/storage/emulated/0/Music/Lectures/01.mp3"))
        assertEquals("Music", deriveFolderKey("file:///storage/self/primary/Music/01.mp3"))
        assertEquals("Music", deriveFolderKey("/sdcard/Music/01.mp3"))
        assertEquals("Music", deriveFolderKey("/storage/1A2B-3C4D/Music/01.mp3"))
        assertEquals("", deriveFolderKey("/storage/emulated/0/01.mp3"))
        assertNull(deriveFolderKey("content://media/audio/1"))
        assertNull(deriveFolderKey(null))
    }

    @Test
    fun `deriveFolderKeyFromTreeUri decodes and strips volume`() {
        assertEquals(
            "Music/Lectures",
            deriveFolderKeyFromTreeUri("content://com.android.externalstorage.documents/tree/primary%3AMusic%2FLectures"),
        )
        assertEquals("downloads", deriveFolderKeyFromTreeUri("content://x/tree/downloads"))
        assertNull(deriveFolderKeyFromTreeUri("content://x/nope"))
    }

    @Test
    fun `safTreeUriForDocument rebuilds tree form`() {
        val uri = "content://auth/tree/primary%3AMusic/document/primary%3AMusic%2FLectures"
        assertEquals("content://auth/tree/primary%3AMusic%2FLectures", safTreeUriForDocument(uri))
        assertNull(safTreeUriForDocument("content://auth/document/primary%3AMusic"))
    }

    @Test
    fun `safDocumentName recovers the last segment`() {
        assertEquals(
            "03.mp3",
            safDocumentName("content://auth/tree/primary%3AMusic/document/primary%3AMusic%2FLectures%2F03.mp3"),
        )
        assertNull(safDocumentName("content://auth/tree/primary%3A"))
    }
}