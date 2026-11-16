package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackPhaseTest {

    @Test
    fun errorOutranksEverything() {
        assertEquals(PlaybackPhase.Error, resolvePlaybackPhase(PlaybackStatus.Playing, PlaybackWait(PlaybackWaitKind.Buffering, 0, true), "boom"))
        assertEquals(PlaybackPhase.Error, resolvePlaybackPhase(PlaybackStatus.Error, null, null))
    }

    @Test
    fun waitOutranksPlaying() {
        assertEquals(PlaybackPhase.Buffering, resolvePlaybackPhase(PlaybackStatus.Playing, PlaybackWait(PlaybackWaitKind.Buffering, 0, true), null))
        assertEquals(PlaybackPhase.Connecting, resolvePlaybackPhase(PlaybackStatus.Playing, PlaybackWait(PlaybackWaitKind.Connecting, 0, true), null))
    }

    @Test
    fun loadingWithoutWaitReadsAsConnecting() {
        assertEquals(PlaybackPhase.Connecting, resolvePlaybackPhase(PlaybackStatus.Loading, null, null))
    }

    @Test
    fun plainStates() {
        assertEquals(PlaybackPhase.Idle, resolvePlaybackPhase(PlaybackStatus.Idle, null, null))
        assertEquals(PlaybackPhase.Playing, resolvePlaybackPhase(PlaybackStatus.Playing, null, null))
        assertEquals(PlaybackPhase.Paused, resolvePlaybackPhase(PlaybackStatus.Paused, null, null))
        assertEquals(PlaybackPhase.Ended, resolvePlaybackPhase(PlaybackStatus.Ended, null, null))
    }

    @Test
    fun isWaitingDetectsBothKinds() {
        assertTrue(isWaiting(PlaybackPhase.Connecting))
        assertTrue(isWaiting(PlaybackPhase.Buffering))
        assertFalse(isWaiting(PlaybackPhase.Playing))
    }

    @Test
    fun waitStages() {
        assertEquals(WaitStage.Hidden, resolveWaitStage(0))
        assertEquals(WaitStage.Hidden, resolveWaitStage(399))
        assertEquals(WaitStage.Early, resolveWaitStage(400))
        assertEquals(WaitStage.Early, resolveWaitStage(5999))
        assertEquals(WaitStage.Long, resolveWaitStage(6000))
    }

    @Test
    fun waitCopyDiffersByKindAndStream() {
        val buffering = describeWait(PlaybackWait(PlaybackWaitKind.Buffering, 0, true), WaitStage.Early)
        assertEquals("Buffering…", buffering.label)
        val streamConnect = describeWait(PlaybackWait(PlaybackWaitKind.Connecting, 0, true), WaitStage.Early)
        assertEquals("Connecting to the source…", streamConnect.label)
        val filePrepare = describeWait(PlaybackWait(PlaybackWaitKind.Connecting, 0, false), WaitStage.Early)
        assertEquals("Preparing audio…", filePrepare.label)
        val long = describeWait(PlaybackWait(PlaybackWaitKind.Buffering, 0, true), WaitStage.Long)
        assertEquals("Still buffering…", long.label)
        assertTrue(long.detail != null)
    }
}