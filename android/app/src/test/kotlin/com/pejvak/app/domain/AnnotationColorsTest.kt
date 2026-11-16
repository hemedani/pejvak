package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AnnotationColorsTest {

    @Test
    fun markerRatioMapsPositionToFraction() {
        assertEquals(0.25f, markerOffsetRatio(30, 120), 0.0001f)
        assertEquals(0f, markerOffsetRatio(0, 120), 0.0001f)
        assertEquals(1f, markerOffsetRatio(120, 120), 0.0001f)
    }

    @Test
    fun markerRatioClamps() {
        assertEquals(1f, markerOffsetRatio(150, 120), 0.0001f)
        assertEquals(0f, markerOffsetRatio(-5, 120), 0.0001f)
    }

    @Test
    fun markerRatioIsZeroWhenDurationIsUnknown() {
        assertEquals(0f, markerOffsetRatio(10, 0), 0.0001f)
    }

    @Test
    fun paletteReturnsColorsInOrder() {
        assertEquals(ANNOTATION_COLORS[0], pickAnnotationColor(0))
        assertEquals(ANNOTATION_COLORS[1], pickAnnotationColor(1))
    }

    @Test
    fun paletteWraps() {
        assertEquals(ANNOTATION_COLORS[0], pickAnnotationColor(ANNOTATION_COLORS.size))
    }

    @Test
    fun paletteHandlesNegativeIndexes() {
        assertEquals(ANNOTATION_COLORS.last(), pickAnnotationColor(-1))
    }

    @Test
    fun everyColorHasAName() {
        ANNOTATION_COLORS.forEach { assertTrue(ANNOTATION_COLOR_NAMES.containsKey(it)) }
    }
}
