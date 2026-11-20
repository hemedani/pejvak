package com.pejvak.app.domain

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        contextType: ContextType? = null,
        contextTitle: String? = null,
        collectionSort: CollectionSort? = null,
        collectionSortDirection: SortDirection? = null,
        collectionIndex: Int? = null,
        collectionSize: Int? = null,
        ambientTone: String? = null,
        ambientLevel: Int? = null,
        volumePercent: Int? = null,
        enhancerEnabled: Boolean? = null,
        enhancerBoostDb: Double? = null,
        enhancerBassDb: Double? = null,
        enhancerTrebleDb: Double? = null,
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
        contextType = contextType,
        contextTitle = contextTitle,
        collectionSort = collectionSort,
        collectionSortDirection = collectionSortDirection,
        collectionIndex = collectionIndex,
        collectionSize = collectionSize,
        ambientTone = ambientTone,
        ambientLevel = ambientLevel,
        volumePercent = volumePercent,
        enhancerEnabled = enhancerEnabled,
        enhancerBoostDb = enhancerBoostDb,
        enhancerBassDb = enhancerBassDb,
        enhancerTrebleDb = enhancerTrebleDb,
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

    private fun richConditions() = PlaybackConditions(
        contextTitle = "Lectures",
        collectionSort = CollectionSort.Manual,
        collectionSortDirection = SortDirection.Desc,
        collectionIndex = 2,
        collectionSize = 5,
        ambientTone = "forest",
        ambientLevel = 30,
        volumePercent = 70,
        enhancerEnabled = true,
        enhancerBoostDb = 3.0,
    )

    @Test
    fun `described context includes direction when asked`() {
        assertEquals(
            listOf("Manual · Descending · 3 of 5", "Forest, level 30", "Volume 70%", "Enhancer +3 dB"),
            describePlaybackConditions(richConditions(), includeDirection = true),
        )
        assertEquals(
            listOf("Manual, 3 of 5", "Forest, level 30", "Volume 70%", "Enhancer +3 dB"),
            describePlaybackConditions(richConditions()),
        )
        assertEquals("70%", playbackVolumeValue(richConditions()))
        assertEquals("+3 dB", playbackEnhancerValue(richConditions()))
    }

    @Test
    fun `markdown context joins title and facts`() {
        assertEquals(
            "Lectures · Manual, 3 of 5 · Forest, level 30 · Volume 70% · Enhancer +3 dB",
            playbackMarkdownContext(richConditions()),
        )
        assertEquals("Volume 100%", playbackMarkdownContext(PlaybackConditions()))
    }

    @Test
    fun `history markdown appends the start item context`() {
        val start = HistoryItem(
            session(
                "a",
                stretchId = "s1",
                startedAt = at("2026-03-09", 9),
                contextType = ContextType.Playlist,
                contextTitle = "Lectures",
                collectionSort = CollectionSort.Manual,
                collectionSortDirection = SortDirection.Desc,
                collectionIndex = 2,
                collectionSize = 5,
                ambientTone = "forest",
                ambientLevel = 30,
                volumePercent = 70,
                enhancerEnabled = true,
                enhancerBoostDb = 3.0,
            ),
            track("a", "Intro"),
            "Lectures",
        )
        val end = HistoryItem(
            session(
                "b",
                stretchId = "s1",
                startedAt = at("2026-03-09", 10),
                contextType = ContextType.Playlist,
                contextTitle = "Later",
                collectionSort = CollectionSort.Name,
                volumePercent = 40,
            ),
            track("b", "Chapter 1"),
            "Later",
        )
        val markdown = historyMarkdown(groupHistoryIntoStretches(listOf(start, end)), at("2026-03-10"))
        assertTrue(markdown.contains("Lectures · Manual, 3 of 5 · Forest, level 30 · Volume 70% · Enhancer +3 dB"))
        assertFalse(markdown.contains("Later"))
        assertFalse(markdown.contains("Volume 40%"))
    }

    @Test
    fun `legacy history markdown falls back to live title and defaults`() {
        val item = HistoryItem(
            session("a", stretchId = "s1", startedAt = at("2026-03-09", 9)),
            track("a", "Intro"),
            "Lectures",
        )
        val markdown = historyMarkdown(groupHistoryIntoStretches(listOf(item)), at("2026-03-10"))
        assertTrue(markdown.contains("Lectures · Volume 100%"))
    }

    @Test
    fun `context facts use value-only volume and enhancer text`() {
        val item = HistoryItem(
            session(
                "a",
                contextType = ContextType.Playlist,
                collectionSort = CollectionSort.Manual,
                collectionSortDirection = SortDirection.Desc,
                collectionIndex = 2,
                collectionSize = 5,
                ambientTone = "forest",
                ambientLevel = 30,
                volumePercent = 70,
                enhancerEnabled = true,
                enhancerBoostDb = 3.0,
                enhancerBassDb = -1.5,
                enhancerTrebleDb = 2.0,
            ),
            track("a", "Intro"),
            "Lectures",
        )
        assertEquals(
            PlaybackContextFacts(
                kind = CollectionKind.Collection,
                title = "Lectures",
                order = "Manual · Descending · 3 of 5",
                ambience = "Forest, level 30",
                volume = "70%",
                enhancer = "+3 dB, bass \u22121.5 dB, treble +2 dB",
            ),
            item.playbackContextFacts(),
        )
    }

    @Test
    fun `blank snapshot titles fall back to live titles or the track title`() {
        val fallback = HistoryItem(
            session("a", contextType = ContextType.Playlist, contextTitle = "   "),
            track("a", "Intro"),
            "Lectures",
        )
        assertEquals("Lectures", fallback.playbackContextFacts().title)
        assertTrue(historyMarkdown(groupHistoryIntoStretches(listOf(fallback)), at("2026-03-10")).contains("Lectures · Volume 100%"))

        val untitled = HistoryItem(
            session("b", contextType = ContextType.Playlist, contextTitle = ""),
            track("b", "Intro"),
            "  ",
        )
        assertEquals("Intro", untitled.playbackContextFacts().title)
    }

    @Test
    fun `detail subtitle prefers the snapshot then live then track title`() {
        val snapshot = HistoryItem(
            session("a", contextType = ContextType.Playlist, contextTitle = "Snapshot"),
            track("a", "Song"),
            "Live",
        )
        assertEquals("Snapshot", snapshot.historySubtitle())

        val live = HistoryItem(
            session("b", contextType = ContextType.Playlist, contextTitle = "  "),
            track("b", "Song"),
            "Live",
        )
        assertEquals("Live", live.historySubtitle())

        val trackFallback = HistoryItem(
            session("c", contextType = ContextType.Playlist, contextTitle = ""),
            track("c", "Song"),
            "  ",
        )
        assertEquals("Song", trackFallback.historySubtitle())
    }
}
