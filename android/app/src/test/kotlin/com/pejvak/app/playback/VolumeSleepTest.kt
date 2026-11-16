package com.pejvak.app.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VolumeTest {
    @Test
    fun fullScaleIsExactlyOne() {
        assertEquals(1.0f, volumeAmplitude(100), 0.0001f)
    }

    @Test
    fun zeroIsSilence() {
        assertEquals(0f, volumeAmplitude(0), 0.0001f)
    }

    @Test
    fun curveIsMonotonic() {
        assertTrue(volumeAmplitude(25) < volumeAmplitude(50))
        assertTrue(volumeAmplitude(50) < volumeAmplitude(100))
    }

    @Test
    fun bottomIsNearSilent() {
        // 1% sits at roughly -39.6 dB → amplitude ~0.0105.
        assertTrue(volumeAmplitude(1) < 0.02f)
    }

    @Test
    fun absentVolumeIsFullScaleNeverMuted() {
        assertEquals(100, normalizeVolume(null))
        assertEquals(100, normalizeVolume(""))
        assertEquals(100, normalizeVolume("  "))
        assertEquals(100, normalizeVolume("nonsense"))
        assertEquals(0, normalizeVolume("0"))
        assertEquals(40, normalizeVolume("40"))
        assertEquals(100, normalizeVolume("150"))
    }
}

class SleepTimerTest {
    @Test
    fun firesExactlyOnceAtDeadline() {
        val timer = SleepTimer()
        timer.start(5, nowMs = 0)
        assertTrue(timer.isActive)
        assertFalse(timer.shouldPause(299_000))
        assertTrue(timer.shouldPause(300_000))
        assertFalse(timer.shouldPause(301_000)) // spent
        assertFalse(timer.isActive)
    }

    @Test
    fun remainingCountsDown() {
        val timer = SleepTimer()
        timer.start(15, nowMs = 0)
        assertEquals(900, timer.remainingSec(0))
        assertEquals(60, timer.remainingSec(840_000))
        assertEquals(0, timer.remainingSec(900_000))
    }

    @Test
    fun cancelStopsIt() {
        val timer = SleepTimer()
        timer.start(5, 0)
        timer.cancel()
        assertFalse(timer.isActive)
        assertFalse(timer.shouldPause(300_000))
        assertNull(timer.remainingSec(0))
    }

    @Test
    fun inactiveNeverFires() {
        val timer = SleepTimer()
        assertFalse(timer.shouldPause(Long.MAX_VALUE))
    }
}