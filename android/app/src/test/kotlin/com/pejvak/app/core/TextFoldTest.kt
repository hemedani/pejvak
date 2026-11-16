package com.pejvak.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextFoldTest {

    @Test
    fun arabicAndPersianYehFoldTogether() {
        assertEquals(foldText("كتاب"), foldText("کتاب"))
    }

    @Test
    fun kafVariantsFold() {
        assertEquals(foldText("ك"), foldText("ک"))
    }

    @Test
    fun digitsNormalize() {
        assertEquals("123", foldText("۱۲۳"))
        assertEquals("123", foldText("١٢٣"))
    }

    @Test
    fun zwnjAndTatweelDropped() {
        assertEquals(foldText("میهن"), foldText("می\u200Cهن"))
        assertEquals(foldText("سلام"), foldText("سـلام"))
    }

    @Test
    fun hamzaCarriersFold() {
        assertEquals(foldText("احمد"), foldText("أحمد"))
    }

    @Test
    fun rtlDetection() {
        assertTrue(isRtlText("سلام دنیا"))
        assertFalse(isRtlText("Hello world"))
        assertFalse(isRtlText("123"))
    }

    @Test
    fun highlightRangesAreIndexAligned() {
        val ranges = highlightRanges("Hello World", "world")
        assertEquals(listOf(6 until 11), ranges)
    }

    @Test
    fun highlightFoldsPersian() {
        val text = "کتاب خوب"
        val ranges = highlightRanges(text, "كتاب")
        assertEquals(1, ranges.size)
        assertEquals(0 until 4, ranges.first())
    }

    @Test
    fun emptyQueryHasNoRanges() {
        assertTrue(highlightRanges("anything", "  ").isEmpty())
    }

    @Test
    fun foldWithMapKeepsATrailBackToTheOriginal() {
        val folded = foldWithMap("Hello  World")
        assertEquals("hello world", folded.text)
        assertEquals(listOf(0, 1, 2, 3, 4, 7, 7, 8, 9, 10, 11), folded.map)
    }

    @Test
    fun foldWithMapDropsInvisiblesButMapsTheRest() {
        val folded = foldWithMap("می\u200Cهن")
        assertEquals("میهن", folded.text)
        assertEquals(listOf(0, 1, 3, 4), folded.map)
    }

    @Test
    fun foldQuerySplitsOnCollapsedWhitespace() {
        assertEquals(listOf("persian", "history"), foldQuery("  Persian   history "))
        assertTrue(foldQuery("   ").isEmpty())
    }
}