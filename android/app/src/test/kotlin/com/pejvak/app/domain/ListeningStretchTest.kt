package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ListeningStretchTest {

    private fun session(
        id: String,
        trackId: String,
        startedAt: Long,
        stretchId: String = id,
        startPositionSec: Int = 0,
        endPositionSec: Int? = 100,
        endedAt: Long? = startedAt + 100,
        completed: Boolean = false,
        seeked: Boolean = false,
        interrupted: Boolean = false,
        durationListenedSec: Int = 100,
    ) = Session(
        id = id, trackId = trackId, contentHash = "h", startedAt = startedAt,
        endedAt = endedAt, startPositionSec = startPositionSec, endPositionSec = endPositionSec,
        durationListenedSec = durationListenedSec, stretchId = stretchId, seeked = seeked,
        completed = completed, interrupted = interrupted, createdAt = startedAt, updatedAt = startedAt,
    )

    @Test
    fun emptyGroupHasNoStretch() {
        assertNull(buildStretch(emptyList()))
    }

    @Test
    fun singleSessionStretch() {
        val s = session("a", "t1", 1000, completed = true)
        val stretch = buildStretch(listOf(s))!!
        assertEquals(1, stretch.trackCount)
        assertEquals("t1", stretch.startTrackId)
        assertEquals("t1", stretch.endTrackId)
        assertEquals(100, stretch.listenedSec)
    }

    @Test
    fun isCompleteRequiresStartAtZeroEndReachedNoSeek() {
        val s = session("a", "t1", 1000, startPositionSec = 0, completed = true, seeked = false)
        assertTrue(buildStretch(listOf(s))!!.isComplete)
        val startedLate = session("a", "t1", 1000, startPositionSec = 30, completed = true)
        assertFalse(buildStretch(listOf(startedLate))!!.isComplete)
        val seeked = session("a", "t1", 1000, startPositionSec = 0, completed = true, seeked = true)
        assertFalse(buildStretch(listOf(seeked))!!.isComplete)
    }

    @Test
    fun multiTrackStretchOrdersByStart() {
        val s1 = session("a", "t1", 1000, stretchId = "g")
        val s2 = session("b", "t2", 2000, stretchId = "g", completed = true)
        val stretch = buildStretch(listOf(s2, s1))!! // deliberately out of order
        assertEquals(2, stretch.trackCount)
        assertEquals("t1", stretch.startTrackId)
        assertEquals("t2", stretch.endTrackId)
        assertEquals(200, stretch.listenedSec)
    }

    @Test
    fun groupingNewestFirst() {
        val s1 = session("a", "t1", 1000, stretchId = "g1")
        val s2 = session("b", "t2", 5000, stretchId = "g2")
        val stretches = groupSessionsIntoStretches(listOf(s1, s2))
        assertEquals(2, stretches.size)
        assertEquals("g2", stretches.first().id)
    }

    @Test
    fun completedStretchResumesFromStart() {
        val s = session("a", "t1", 1000, startPositionSec = 10, completed = true)
        val target = stretchResumeTarget(buildStretch(listOf(s))!!)
        assertEquals("t1", target.trackId)
        assertEquals(10, target.positionSec)
    }

    @Test
    fun incompleteStretchResumesFromEnd() {
        val s1 = session("a", "t1", 1000, stretchId = "g")
        val s2 = session("b", "t2", 2000, stretchId = "g", endPositionSec = 50, completed = false)
        val target = stretchResumeTarget(buildStretch(listOf(s1, s2))!!)
        assertEquals("t2", target.trackId)
        assertEquals(50, target.positionSec)
    }

    @Test
    fun outcomeVocabulary() {
        val complete = session("a", "t1", 1000, startPositionSec = 0, completed = true)
        assertEquals(StretchOutcome.Complete, describeStretchOutcome(buildStretch(listOf(complete))!!))
        val open = session("a", "t1", 1000, endedAt = null, endPositionSec = null)
        assertEquals(StretchOutcome.Open, describeStretchOutcome(buildStretch(listOf(open))!!))
    }
}