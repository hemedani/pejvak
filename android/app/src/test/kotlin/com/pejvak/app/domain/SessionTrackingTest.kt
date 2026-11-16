package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The wall-clock delta rule — the highest-value math in the product. */
class SessionTrackingTest {

    private fun tracker(start: Double = 0.0) =
        createSessionTracker("s1", startedAtMs = 0, startPositionSec = start, playbackSpeed = 1.0)

    @Test
    fun normalPlayAddsDelta() {
        var state = tracker()
        val r = applyProgress(state, ProgressInput(positionSec = 3.0, atMs = 3000))
        assertEquals(3.0, r.countedSec, 0.0001)
        assertFalse(r.isSeek)
        assertEquals(3.0, r.state.durationListenedSec, 0.0001)
    }

    @Test
    fun forwardSeekDoesNotAdd() {
        val state = tracker()
        val r = applyProgress(state, ProgressInput(positionSec = 60.0, atMs = 1000))
        assertTrue(r.isSeek)
        assertEquals(0.0, r.countedSec, 0.0001)
        assertEquals(60.0, r.state.lastPositionSec, 0.0001)
        assertEquals(0.0, r.state.durationListenedSec, 0.0001)
    }

    @Test
    fun backwardSeekDoesNotAdd() {
        val state = tracker(start = 100.0)
        val r = applyProgress(state, ProgressInput(positionSec = 40.0, atMs = 1000))
        assertTrue(r.isSeek)
        assertEquals(0.0, r.countedSec, 0.0001)
    }

    @Test
    fun deltaExactlyFiveNeitherAddsNorSeeks() {
        val state = tracker()
        val r = applyProgress(state, ProgressInput(positionSec = 5.0, atMs = 5000))
        assertFalse(r.isSeek)
        assertEquals(0.0, r.countedSec, 0.0001)
    }

    @Test
    fun accumulatesAcrossTicks() {
        var state = tracker()
        state = applyProgress(state, ProgressInput(1.0, 1000)).state
        state = applyProgress(state, ProgressInput(2.0, 2000)).state
        val r = applyProgress(state, ProgressInput(3.0, 3000))
        assertEquals(3.0, r.state.durationListenedSec, 0.0001)
    }

    @Test
    fun seekThenPlayResumesCounting() {
        var state = tracker()
        state = applyProgress(state, ProgressInput(100.0, 1000)).state // seek
        val r = applyProgress(state, ProgressInput(102.0, 3000))
        assertEquals(2.0, r.countedSec, 0.0001)
        assertEquals(2.0, r.state.durationListenedSec, 0.0001)
    }

    @Test
    fun checkpointDueAfterTenSeconds() {
        val state = tracker()
        assertFalse(applyProgress(state, ProgressInput(1.0, 9999)).checkpointDue)
        assertTrue(applyProgress(state, ProgressInput(1.0, 10000)).checkpointDue)
    }

    @Test
    fun checkpointResetsLastCheckpointTime() {
        var state = tracker()
        state = applyProgress(state, ProgressInput(1.0, 10000)).state
        assertEquals(10000, state.lastCheckpointAtMs)
        assertFalse(applyProgress(state, ProgressInput(2.0, 15000)).checkpointDue)
        assertTrue(applyProgress(state, ProgressInput(3.0, 20000)).checkpointDue)
    }

    @Test
    fun persistenceRoundsToIntegerSeconds() {
        var state = tracker()
        state = applyProgress(state, ProgressInput(2.6, 2600)).state
        assertEquals(3, state.durationListenedSecInt)
        assertEquals(3, state.lastPositionSecInt)
    }
}