package com.pejvak.app.domain

import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DateRangeTest {

    private val zone = ZoneOffset.UTC
    private val noon = LocalDateTime.of(2026, 3, 9, 12, 0).toInstant(zone).toEpochMilli()

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int = 0, nano: Int = 0) =
        LocalDateTime.of(year, month, day, hour, minute, second, nano).toInstant(zone).toEpochMilli()

    @Test
    fun weekCountsTodayAsOneOfTheDays() {
        val week = presetRange(DatePreset.Week, noon, zone)
        assertEquals(startOfDay(at(2026, 3, 3, 0, 0), zone), week.from)
        assertEquals(at(2026, 3, 9, 23, 59, 59, 999_000_000), week.to)
    }

    @Test
    fun anyDateHasNoBounds() {
        assertEquals(ANY_DATE, presetRange(DatePreset.Any, noon, zone))
        assertFalse(isRangeActive(presetRange(DatePreset.Any, noon, zone)))
    }

    @Test
    fun thisYearStartsOnJanuaryFirst() {
        assertEquals(startOfDay(at(2026, 1, 1, 0, 0), zone), presetRange(DatePreset.Year, noon, zone).from)
    }

    @Test
    fun rangeIncludesTheLastMillisecondOfTheDay() {
        val today = presetRange(DatePreset.Today, noon, zone)
        assertTrue(rangeContains(today, at(2026, 3, 9, 23, 59, 59, 999_000_000)))
    }

    @Test
    fun rangeExcludesTheNextDay() {
        val today = presetRange(DatePreset.Today, noon, zone)
        assertFalse(rangeContains(today, at(2026, 3, 10, 0, 0)))
    }

    @Test
    fun missingBoundsAreOpen() {
        assertTrue(rangeContains(DateRange(startOfDay(noon, zone), null), noon + 10_000_000_000))
        assertTrue(rangeContains(DateRange(null, startOfDay(noon, zone)), noon - 10_000_000_000))
    }

    @Test
    fun describeNamesASingleDayOnce() {
        val range = DateRange(startOfDay(noon, zone), startOfDay(noon, zone))
        assertEquals("9 Mar", describeDateRange(range, noon, zone))
    }

    @Test
    fun describeNamesBothEnds() {
        val week = presetRange(DatePreset.Week, noon, zone)
        assertEquals("3 Mar – 9 Mar", describeDateRange(week, noon, zone))
    }

    @Test
    fun describeSaysAnyDateForAnEmptyRange() {
        assertEquals("Any date", describeDateRange(ANY_DATE, noon, zone))
    }

    @Test
    fun describeKeepsTheYearWhenItIsNotThisOne() {
        val lastYear = at(2025, 12, 30, 12, 0)
        assertEquals("30 Dec 2025", describeDateRange(DateRange(lastYear, lastYear), noon, zone))
    }

    @Test
    fun presetForRangeRecognisesItsOwnPreset() {
        assertEquals(DatePreset.Month, presetForRange(presetRange(DatePreset.Month, noon, zone), noon, zone))
    }

    @Test
    fun presetForRangeCallsAnythingElseCustom() {
        val odd = DateRange(at(2026, 2, 2, 0, 0), null)
        assertEquals(DatePreset.Custom, presetForRange(odd, noon, zone))
    }

    @Test
    fun formatDateInputRoundTripsADay() {
        assertEquals("2026-03-09", formatDateInput(startOfDay(noon, zone), zone))
    }
}
