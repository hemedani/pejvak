package com.pejvak.app.domain

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoryTest {
    private val zone = ZoneId.of("UTC")
    private fun at(day: String, hour: Int = 12): Long =
        LocalDate.parse(day).atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun track(id: String, title: String = id) = Track(
        id = id,
        contentHash = "hash-$id",
        title = title,
        durationSec = 600,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun session(
        id: String,
        trackId: String = id,
        stretchId: String = "st-$id",
        startedAt: Long = at("2026-03-09"),
        endedAt: Long? = startedAt + 60_000,
        listenedSec: Int = 60,
        completed: Boolean = false,
        interrupted: Boolean = false,
        startPositionSec: Int = 0,
        endPositionSec: Int? = 60,
        seeked: Boolean = false,
    ) = Session(
        id = id,
        trackId = trackId,
        contentHash = "hash-$trackId",
        startedAt = startedAt,
        endedAt = endedAt,
        startPositionSec = startPositionSec,
        endPositionSec = endPositionSec,
        durationListenedSec = listenedSec,
        completed = completed,
        interrupted = interrupted,
        createdAt = startedAt,
        updatedAt = startedAt,
        stretchId = stretchId,
        seeked = seeked,
    )

    @Test
    fun `stretches pair their members in listening order`() {
        val items = listOf(
            HistoryItem(session("b", stretchId = "s1", startedAt = at("2026-03-09", 10)), track("b"), "Lectures"),
            HistoryItem(session("a", stretchId = "s1", startedAt = at("2026-03-09", 9)), track("a"), "Lectures"),
        )
        val entry = groupHistoryIntoStretches(items).single()
        assertEquals(listOf("a", "b"), entry.items.map { it.session.id })
        assertEquals("a", entry.start.track.id)
        assertEquals("b", entry.end.track.id)
        assertEquals("a → b", describeStretchTitle(entry))
        assertEquals("Lectures", entry.start.contextTitle)
    }

    @Test
    fun `cursor uses the newest member of the oldest stretch`() {
        val items = listOf(
            HistoryItem(session("a", stretchId = "s2", startedAt = at("2026-03-10", 10)), track("a")),
            HistoryItem(session("b", stretchId = "s2", startedAt = at("2026-03-10", 9)), track("b")),
            HistoryItem(session("c", stretchId = "s1", startedAt = at("2026-03-09", 8)), track("c")),
        )
        val cursor = historyCursorFor(items)!!
        assertEquals("s1", cursor.stretchId)
        assertEquals(at("2026-03-09", 8), cursor.startedAt)
        assertNull(historyCursorFor(emptyList()))
    }

    @Test
    fun `merging pages drops duplicates and keeps identity when nothing is new`() {
        val previous = listOf(HistoryItem(session("a"), track("a")))
        val same = mergeHistoryPages(previous, listOf(HistoryItem(session("a"), track("a"))))
        assertTrue(same === previous)
        val merged = mergeHistoryPages(previous, listOf(HistoryItem(session("b"), track("b"))))
        assertEquals(listOf("a", "b"), merged.map { it.session.id })
    }

    @Test
    fun `days are labelled and ordered both ways`() {
        val now = at("2026-03-10", 15)
        val items = listOf(
            HistoryItem(session("old", startedAt = at("2026-03-08", 9)), track("old")),
            HistoryItem(session("today", startedAt = at("2026-03-10", 9)), track("today")),
            HistoryItem(session("yday", startedAt = at("2026-03-09", 9)), track("yday")),
        )
        val newest = groupByDay(items, { it.session.startedAt }, now, HistorySort.Newest, zone)
        assertEquals(listOf("Today", "Yesterday", "Sun, Mar 8"), newest.map { it.label })
        val oldest = groupByDay(items, { it.session.startedAt }, now, HistorySort.Oldest, zone)
        assertEquals(listOf("Sun, Mar 8", "Yesterday", "Today"), oldest.map { it.label })
    }

    @Test
    fun `longest sort is flat and orders by listened seconds`() {
        val entries = listOf(
            HistoryItem(session("a", stretchId = "s1", listenedSec = 30), track("a")),
            HistoryItem(session("b", stretchId = "s2", listenedSec = 90), track("b")),
        )
        val sections = buildStretchSections(groupHistoryIntoStretches(entries), HistorySort.Longest)
        assertNull(sections.single().title)
        assertEquals(listOf("b", "a"), sections.single().data.map { it.stretch.startTrackId })
    }

    @Test
    fun `resume target replays a completed listen from where it began`() {
        val done = HistoryItem(session("a", completed = true, startPositionSec = 10, endPositionSec = 600), track("a"))
        val doneEntry = groupHistoryIntoStretches(listOf(done)).single()
        assertEquals(10, stretchResumeTarget(doneEntry).second)

        val open = HistoryItem(session("b", endedAt = null, endPositionSec = null, startPositionSec = 20), track("b"))
        val openEntry = groupHistoryIntoStretches(listOf(open)).single()
        assertEquals(20, stretchResumeTarget(openEntry).second)
        assertEquals(20, resumeTargetSec(open.session))
    }

    @Test
    fun `markdown names both ends and carries the outcome`() {
        val entries = groupHistoryIntoStretches(
            listOf(
                HistoryItem(session("a", stretchId = "s1", startedAt = at("2026-03-09", 9)), track("a", "Intro")),
                HistoryItem(
                    session(
                        "b",
                        stretchId = "s1",
                        startedAt = at("2026-03-09", 10),
                        completed = true,
                        endPositionSec = 600,
                    ),
                    track("b", "Chapter 1"),
                ),
            ),
        )
        val markdown = historyMarkdown(entries, at("2026-03-10"))
        assertTrue(markdown.startsWith("# Listening history"))
        assertTrue(markdown.contains("## Yesterday"))
        assertTrue(markdown.contains("**Intro → Chapter 1**"))
        assertTrue(markdown.contains("2 tracks"))
        assertTrue(markdown.contains("Complete"))
    }

    @Test
    fun `empty history still renders a valid document`() {
        assertEquals("# Listening history\n\n_No listens recorded yet._", historyMarkdown(emptyList()))
    }
}
