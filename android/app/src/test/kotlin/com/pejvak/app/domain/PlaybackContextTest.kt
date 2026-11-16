package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackContextTest {
    private fun run(
        completed: Boolean = false,
        finishedCount: Int = 9,
        trackCount: Int = 24,
        lastPositionSec: Int = 120,
        startedAt: Long = 1000,
    ) = ContextPlay(
        id = "run-$startedAt",
        contextType = ContextType.Folder,
        contextKey = "Lectures",
        contextTitle = "Lectures",
        trackCount = trackCount,
        startedAt = startedAt,
        lastPositionSec = lastPositionSec,
        finishedCount = finishedCount,
        completed = completed,
        createdAt = startedAt,
        updatedAt = startedAt,
    )

    @Test
    fun `same context matches both halves`() {
        val a = PlaybackContext(ContextType.Folder, "A", "A")
        assertTrue(sameContext(a, PlaybackContext(ContextType.Folder, "A", "B")))
        assertFalse(sameContext(a, PlaybackContext(ContextType.Playlist, "A", "A")))
        assertFalse(sameContext(a, PlaybackContext(ContextType.Folder, "B", "B")))
        assertTrue(sameContext(null, null))
        assertFalse(sameContext(a, null))
    }

    @Test
    fun `type names`() {
        assertEquals("Folder", describeContextType(ContextType.Folder))
        assertEquals("Playlist", describeContextType(ContextType.Playlist))
        assertEquals("Online", describeContextType(ContextType.Online))
    }

    @Test
    fun `progress ratio clamps and never divides by zero`() {
        assertEquals(0.25, runProgressRatio(6, 24), 0.0001)
        assertEquals(0.0, runProgressRatio(0, 0), 0.0)
        assertEquals(1.0, runProgressRatio(30, 24), 0.0)
        assertEquals(0.0, runProgressRatio(-1, 24), 0.0)
    }

    @Test
    fun `partial means started, unfinished and not completed`() {
        assertTrue(isPartialRun(run().shape()))
        assertFalse(isPartialRun(run(completed = true).shape()))
        assertFalse(isPartialRun(run(finishedCount = 24, trackCount = 24).shape()))
        assertFalse(isPartialRun(run(finishedCount = 0, trackCount = 0).shape()))
    }

    @Test
    fun `position counts from one and clamps to the collection`() {
        assertEquals("1 of 12", formatContextPosition(0, 12))
        assertEquals("9 of 24", formatContextPosition(8, 24))
        assertEquals("", formatContextPosition(0, 0))
        assertEquals("12 of 12", formatContextPosition(99, 12))
    }

    @Test
    fun `run outcome names the partial series`() {
        assertEquals(RunOutcome("Finished", RunTone.Done), describeRunOutcome(run(completed = true).shape()))
        assertEquals(
            RunOutcome("All tracks heard", RunTone.Done),
            describeRunOutcome(run(finishedCount = 24, trackCount = 24).shape()),
        )
        assertEquals(
            RunOutcome("Stopped at 9 of 24", RunTone.Partial),
            describeRunOutcome(run().shape()),
        )
        assertEquals(RunOutcome("Left early", RunTone.Partial), describeRunOutcome(run(finishedCount = 0).shape()))
    }

    @Test
    fun `context stats stay silent until played and omit zero completions`() {
        assertNull(describeContextStats(ContextStats()))
        assertEquals("Played 1 time", describeContextStats(ContextStats(playCount = 1)))
        assertEquals("Played 3 times", describeContextStats(ContextStats(playCount = 3)))
        assertEquals(
            "Played 5 times, finished 3",
            describeContextStats(ContextStats(playCount = 5, completedPlayCount = 3)),
        )
    }

    @Test
    fun `play count is null rather than zero`() {
        assertNull(formatPlayCount(0))
        assertEquals("1 play", formatPlayCount(1))
        assertEquals("4 plays", formatPlayCount(4))
    }

    @Test
    fun `run scope counts finished tracks`() {
        assertEquals("9 of 24 tracks finished", describeRunScope(run().shape()))
        assertEquals("All 1 track finished", describeRunScope(run(finishedCount = 1, trackCount = 1).shape()))
        assertEquals("Empty collection", describeRunScope(run(finishedCount = 0, trackCount = 0).shape()))
    }

    @Test
    fun `resume target is zero for a finished run`() {
        assertEquals(0, runResumeTargetSec(run(completed = true)))
        assertEquals(120, runResumeTargetSec(run(lastPositionSec = 120)))
    }

    @Test
    fun `latest partial run is the newest incomplete one`() {
        val newest = run(startedAt = 3000, finishedCount = 24, trackCount = 24)
        val partial = run(startedAt = 2000)
        val older = run(startedAt = 1000)
        assertEquals(partial.id, latestPartialRun(listOf(newest, partial, older))?.id)
        assertNull(latestPartialRun(listOf(newest)))
    }
}
