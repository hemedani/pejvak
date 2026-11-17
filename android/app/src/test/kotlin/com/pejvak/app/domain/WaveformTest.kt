package com.pejvak.app.domain

import kotlin.math.pow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WaveformTest {

    @Test
    fun silenceSitsOnTheFloor() {
        assertEquals(WAVEFORM_MIN_HEIGHT, waveformHeight(0f), 0.0001f)
        assertEquals(WAVEFORM_MIN_HEIGHT, waveformHeight(-1f), 0.0001f)
    }

    @Test
    fun mappingIsDecibelBasedAndClamped() {
        // -52 dBFS is the floor, -6 dBFS fills the bar, anything louder clamps.
        assertEquals(WAVEFORM_MIN_HEIGHT, waveformHeight(dbToRms(WAVEFORM_FLOOR_DB)), 0.001f)
        assertEquals(1f, waveformHeight(dbToRms(WAVEFORM_CEIL_DB)), 0.001f)
        assertEquals(1f, waveformHeight(1f), 0.001f)
        // Halfway between the floor and the ceiling is halfway up the bar.
        val middle = (WAVEFORM_FLOOR_DB + WAVEFORM_CEIL_DB) / 2f
        val expected = WAVEFORM_MIN_HEIGHT + (1f - WAVEFORM_MIN_HEIGHT) / 2f
        assertEquals(expected, waveformHeight(dbToRms(middle)), 0.001f)
    }

    @Test
    fun quietSpeechStillLeavesVisibleBars() {
        // -30 dBFS is a normal speaking level for an audiobook.
        val height = waveformHeight(dbToRms(-30f))
        assertTrue("speech should clear the floor", height > WAVEFORM_MIN_HEIGHT + 0.2f)
        assertTrue("speech should not fill the bar", height < 0.85f)
    }

    @Test
    fun waveformFromRmsKeepsShapeAndRange() {
        val heights = waveformFromRms(floatArrayOf(0f, 0.001f, 0.05f, 0.5f))
        assertEquals(4, heights.size)
        heights.forEach { height ->
            assertTrue(height >= WAVEFORM_MIN_HEIGHT - 0.0001f)
            assertTrue(height <= 1.0001f)
        }
        assertTrue(heights[0] < heights[2])
        assertTrue(heights[2] < heights[3])
    }

    @Test
    fun samplingKeepsPeaksAndHonoursBarCount() {
        val values = floatArrayOf(0.1f, 0.9f, 0.1f, 0.1f)
        val two = sampleWaveform(values, 2)
        assertEquals(2, two.size)
        assertEquals(0.9f, two[0], 0.0001f)
        assertEquals(0.1f, two[1], 0.0001f)
    }

    @Test
    fun samplingHandlesMoreBarsThanBuckets() {
        val values = floatArrayOf(0.2f, 0.8f)
        val bars = sampleWaveform(values, 4)
        assertEquals(4, bars.size)
        assertEquals(0.2f, bars[0], 0.0001f)
        assertEquals(0.8f, bars[3], 0.0001f)
    }

    @Test
    fun emptyInputsDegradeToTheFloor() {
        assertEquals(0, sampleWaveform(floatArrayOf(), 0).size)
        val fallback = sampleWaveform(floatArrayOf(), 6)
        assertEquals(6, fallback.size)
        fallback.forEach { assertEquals(WAVEFORM_MIN_HEIGHT, it, 0.0001f) }
    }

    @Test
    fun rmsAndFullScaleConversions() {
        assertEquals(0f, rmsOf(0.0, 0), 0.0001f)
        assertEquals(0.5f, rmsOf(0.25 * 4, 4), 0.0001f)
        assertEquals(1f, pcm16FullScale(Short.MAX_VALUE.toShort()).let { abs(it) }, 0.001f)
        assertEquals(0f, pcm16FullScale(0), 0.0001f)
    }

    private fun dbToRms(db: Float): Float = 10.0.pow((db / 20f).toDouble()).toFloat()

    private fun abs(value: Float): Float = if (value < 0f) -value else value
}
