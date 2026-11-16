package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadProgressTest {
    @Test
    fun `percent is clamped and zero without a total`() {
        assertEquals(0.0, percentOf(10, 0), 0.001)
        assertEquals(50.0, percentOf(5, 10), 0.001)
        assertEquals(100.0, percentOf(20, 10), 0.001)
    }

    @Test
    fun `first sample always writes`() {
        assertTrue(shouldWriteProgress(null, ProgressSample(1, 10), 0))
    }

    @Test
    fun `a changed total writes immediately`() {
        val prev = ProgressWrite(ProgressSample(1, 10), at = 100)
        assertTrue(shouldWriteProgress(prev, ProgressSample(2, 11), 110))
    }

    @Test
    fun `half a second writes even without a visible change`() {
        val prev = ProgressWrite(ProgressSample(1, 1000), at = 100)
        assertTrue(shouldWriteProgress(prev, ProgressSample(2, 1000), 600))
    }

    @Test
    fun `a whole percentage point writes inside the window`() {
        val prev = ProgressWrite(ProgressSample(10, 100), at = 100)
        assertTrue(shouldWriteProgress(prev, ProgressSample(11, 100), 110))
    }

    @Test
    fun `small byte moves inside the window do not write`() {
        val prev = ProgressWrite(ProgressSample(10, 1000), at = 100)
        assertFalse(shouldWriteProgress(prev, ProgressSample(15, 1000), 110))
    }
}
