package com.pejvak.app.domain

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HistoryStatsTest {
    private val zone = ZoneId.of("UTC")
    private fun at(day: String, hour: Int = 12): Long =
        LocalDate.parse(day).atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun item(
        id: String,
        day: String,
        listenedSec: Int,
        ended: Boolean = true,
        audiobook: Boolean = false,
        title: String = id,
    ): HistoryItem {
        val started = at(day)
        return HistoryItem(
            session = Session(
                id = id,
                trackId = "t-$id",
                contentHash = "h-$id",
                startedAt = started,
                endedAt = if (ended) started + listenedSec * 1000L else null,
                durationListenedSec = listenedSec,
                completed = false,
                createdAt = started,
                updatedAt = started,
                stretchId = "s-$id",
            ),
            track = Track(
                id = "t-$id",
                contentHash = "h-$id",
                title = title,
                isAudiobook = audiobook,
                durationSec = 1000,
                createdAt = 0,
                updatedAt = 0,
            ),
        )
    }

    @Test
    fun `totals ignore an open session`() {
        val items = listOf(
            item("a", "2026-03-09", 60),
            item("b", "2026-03-10", 120),
            item("c", "2026-03-10", 999, ended = false),
        )
        val stats = computeListeningStats(items, zone)
        assertEquals(180, stats.totalListenTimeSec)
        assertEquals(2, stats.sessionCount)
        assertEquals(2, stats.trackCount)
        assertEquals(90, stats.averageSessionSec)
        assertEquals(2, stats.activeDayCount)
        assertEquals(120, stats.longestSessionSec)
        assertEquals("t-b", stats.longestSessionTrackId)
        assertEquals(at("2026-03-10") + 120_000, stats.lastPlayedAt)
    }

    @Test
    fun `empty history has no leaders or last play`() {
        val stats = computeListeningStats(emptyList(), zone)
        assertEquals(0, stats.sessionCount)
        assertNull(stats.lastPlayedAt)
        assertNull(stats.longestSessionTitle)
        assertEquals(0, computeBestStreak(emptyList(), zone))
    }

    @Test
    fun `leaders aggregate by content hash and cap`() {
        val items = listOf(
            item("a", "2026-03-09", 30, title = "Alpha"),
            item("b", "2026-03-09", 90, title = "Beta"),
            item("c", "2026-03-10", 40, title = "Gamma"),
        )
        val leaders = computeTrackLeaders(items, limit = 2)
        assertEquals(listOf("Beta", "Gamma"), leaders.map { it.title })
        assertEquals(90, leaders.first().listenTimeSec)
    }

    @Test
    fun `daily totals are chronological`() {
        val items = listOf(item("a", "2026-03-10", 30), item("b", "2026-03-09", 60))
        val daily = computeDailyListen(items, zone)
        assertEquals(listOf("2026-03-09", "2026-03-10"), daily.map { it.key })
        assertEquals(listOf(60, 30), daily.map { it.listenTimeSec })
    }

    @Test
    fun `streak counts back from today or yesterday`() {
        val items = listOf(
            item("a", "2026-03-08", 10),
            item("b", "2026-03-09", 10),
            item("c", "2026-03-10", 10),
        )
        assertEquals(3, computeDayStreak(items, at("2026-03-10", 20), zone))
        assertEquals(3, computeDayStreak(items, at("2026-03-11", 20), zone))
        assertEquals(0, computeDayStreak(items, at("2026-03-12", 20), zone))
        assertEquals(3, computeBestStreak(items, zone))
    }

    @Test
    fun `media split follows the track flag`() {
        val items = listOf(
            item("a", "2026-03-09", 30, audiobook = true),
            item("b", "2026-03-09", 70),
        )
        val split = computeMediaBreakdown(items)
        assertEquals(30, split.audiobookSec)
        assertEquals(70, split.musicSec)
    }
}
