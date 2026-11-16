package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerFormatTest {

    @Test
    fun `clock formats minutes and rolls into hours`() {
        assertEquals("0:00", formatClock(0))
        assertEquals("0:07", formatClock(7))
        assertEquals("12:34", formatClock(754))
        assertEquals("1:00:00", formatClock(3600))
        assertEquals("2:05:09", formatClock(7509))
        assertEquals("0:00", formatClock(-5))
    }

    @Test
    fun `remaining is never negative and uses a true minus`() {
        assertEquals("\u22124:00", formatRemaining(0, 240))
        assertEquals("\u22120:00", formatRemaining(300, 240))
        assertEquals("\u22121:00:00", formatRemaining(0, 3600))
    }

    @Test
    fun `listened readout uses wall clock words`() {
        assertEquals("0 min", formatListened(0))
        assertEquals("0 min", formatListened(59))
        assertEquals("1 min", formatListened(60))
        assertEquals("59 min", formatListened(3599))
        assertEquals("1 h 0 min", formatListened(3600))
        assertEquals("2 h 5 min", formatListened(7500))
    }

    @Test
    fun `context label is one based and clamped`() {
        assertEquals("1 of 12", contextPositionLabel(0, 12))
        assertEquals("4 of 12", contextPositionLabel(3, 12))
        assertEquals("12 of 12", contextPositionLabel(20, 12))
        assertNull(contextPositionLabel(0, 0))
    }

    @Test
    fun `speed cycles through the five steps and wraps`() {
        assertEquals(1.25, nextSpeed(1.0), 0.0)
        assertEquals(2.0, nextSpeed(1.5), 0.0)
        assertEquals(0.75, nextSpeed(2.0), 0.0)
        assertEquals(1.0, nextSpeed(1.7), 0.0)
    }

    @Test
    fun `speed chip drops a trailing zero`() {
        assertEquals("1\u00d7", formatSpeed(1.0))
        assertEquals("1.25\u00d7", formatSpeed(1.25))
        assertEquals("2\u00d7", formatSpeed(2.0))
    }

    @Test
    fun `sleep label rounds up to whole minutes and falls back to Sleep`() {
        assertEquals("Sleep", sleepTimerLabel(null))
        assertEquals("Sleep", sleepTimerLabel(0))
        assertEquals("Sleep 1m", sleepTimerLabel(1))
        assertEquals("Sleep 1m", sleepTimerLabel(30))
        assertEquals("Sleep 15m", sleepTimerLabel(841))
    }

    @Test
    fun `digits read right to left into seconds`() {
        assertEquals(0, digitsToSeconds(""))
        assertEquals(45, digitsToSeconds("45"))
        assertEquals(90, digitsToSeconds("130"))
        assertEquals(754, digitsToSeconds("1234"))
        assertEquals(45296, digitsToSeconds("123456"))
        assertEquals(754, digitsToSeconds("12:34"))
        assertEquals(45296, digitsToSeconds("12:34:56"))
    }

    @Test
    fun `seconds clamp to the track`() {
        assertEquals(0, clampSeconds(-4, 100))
        assertEquals(42, clampSeconds(42, 100))
        assertEquals(100, clampSeconds(420, 100))
        assertEquals(0, clampSeconds(42, 0))
    }

    @Test
    fun `enhancer normalises to half decibel steps and clamps each band`() {
        val normalised = normalizeEnhancer(
            AudioEnhancerSettings(enabled = true, boostDb = 3.26, bassDb = -30.0, trebleDb = 20.0),
        )
        assertEquals(3.5, normalised.boostDb, 0.0)
        assertEquals(-12.0, normalised.bassDb, 0.0)
        assertEquals(12.0, normalised.trebleDb, 0.0)
    }

    @Test
    fun `moving a band implies enabled`() {
        val patched = patchEnhancer(AudioEnhancerSettings(), bassDb = 4.0)
        assertTrue(patched.enabled)
        assertEquals(4.0, patched.bassDb, 0.0)
    }

    @Test
    fun `an explicit switch is respected`() {
        val patched = patchEnhancer(AudioEnhancerSettings(), enabled = false, bassDb = 4.0)
        assertFalse(patched.enabled)
    }

    @Test
    fun `flat and active are different questions`() {
        assertTrue(isEnhancerFlat(AudioEnhancerSettings()))
        assertFalse(isEnhancerActive(AudioEnhancerSettings()))
        assertTrue(isEnhancerActive(AudioEnhancerSettings(enabled = true, boostDb = 3.0)))
    }

    @Test
    fun `gain copy is signed and never a bare number`() {
        assertEquals("Off", describeGainDb(0.0))
        assertEquals("+3.0 dB", describeGainDb(3.0))
        assertEquals("\u22124.5 dB", describeGainDb(-4.5))
    }

    @Test
    fun `the tone catalogue has seven tones with room first`() {
        assertEquals(7, TONES.size)
        assertEquals("room", TONES.first().id)
        assertEquals(ToneKind.Generated, TONES.first().kind)
        assertEquals(6, TONE_CREDITS.size)
        TONES.filter { it.kind == ToneKind.Recorded }.forEach { tone ->
            assertTrue("missing credit for ${tone.id}", TONE_CREDITS.containsKey(tone.id))
        }
        assertTrue(describeCredits().contains("CC"))
        assertEquals("rain", findTone("rain")?.id)
        assertNull(findTone("nope"))
    }
}
