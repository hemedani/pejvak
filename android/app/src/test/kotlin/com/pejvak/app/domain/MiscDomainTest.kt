package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneOffset

class MiscDomainTest {

    // --- Palette ---
    @Test
    fun hashStringIsStableAndUnsigned() {
        assertEquals(hashString("pejvak"), hashString("pejvak"))
        assertTrue(hashString("anything") >= 0)
    }

    @Test
    fun paletteIndexInRangeAndDeterministic() {
        val seed = TrackSeed(contentHash = "abc")
        val idx = paletteIndexFor(seed)
        assertTrue(idx in 0 until AURORA_COUNT)
        assertEquals(idx, paletteIndexFor(seed))
        assertEquals(idx, paletteIndexFor("abc"))
    }

    @Test
    fun paletteFallsBackToTitleThenId() {
        assertEquals(paletteIndexFor(TrackSeed(title = "T")), paletteIndexFor("T"))
        assertEquals(paletteIndexFor(TrackSeed(id = "I")), paletteIndexFor("I"))
        assertEquals(paletteIndexFor("pejvak"), paletteIndexFor(TrackSeed()))
    }

    // --- Resume ---
    @Test
    fun clampResumeRestartsNearEnd() {
        assertEquals(0, clampResumePosition(595, 600))
        assertEquals(120, clampResumePosition(120, 600))
        assertEquals(0, clampResumePosition(0, 600))
        assertEquals(0, clampResumePosition(-5, 600))
        assertEquals(120, clampResumePosition(120, 0))
    }

    // --- MediaFolders ---
    @Test
    fun naturalCompareNumericRuns() {
        assertTrue(naturalCompare("2", "10") < 0)
        assertTrue(naturalCompare("track2", "track10") < 0)
        // Same number, shorter form first (stable, not input-order dependent).
        assertTrue(naturalCompare("2", "02") < 0)
        assertTrue(naturalCompare("a", "b") < 0)
    }

    @Test
    fun folderNameFromKey() {
        assertEquals("Physics", folderNameFromKey("Lectures/Physics"))
        assertEquals("Internal storage", folderNameFromKey(""))
    }

    @Test
    fun folderRouteSegmentRoundTrip() {
        assertEquals("~root", folderKeyToRouteSegment(""))
        assertEquals("", folderKeyFromRouteSegment("~root"))
        assertEquals("Lectures", folderKeyFromRouteSegment("Lectures"))
    }

    @Test
    fun orderFolderTracksUsesNumbersWhenFullyTagged() {
        val tracks = listOf(
            Track(id = "b", contentHash = "hb", title = "B", trackNumber = 2, createdAt = 0, updatedAt = 0),
            Track(id = "a", contentHash = "ha", title = "A", trackNumber = 1, createdAt = 0, updatedAt = 0),
        )
        assertEquals(listOf("a", "b"), orderFolderTracks(tracks).map { it.id })
    }

    @Test
    fun orderFolderTracksFallsBackToNaturalName() {
        val tracks = listOf(
            Track(id = "b", contentHash = "hb", title = "B", fileName = "10.mp3", createdAt = 0, updatedAt = 0),
            Track(id = "a", contentHash = "ha", title = "A", fileName = "2.mp3", createdAt = 0, updatedAt = 0),
        )
        assertEquals(listOf("a", "b"), orderFolderTracks(tracks).map { it.id })
    }

    // --- TimeFormat ---
    @Test
    fun formatClock() {
        assertEquals("0:00", formatClock(0))
        assertEquals("1:05", formatClock(65))
        assertEquals("1:01:05", formatClock(3665))
    }

    @Test
    fun formatDuration() {
        assertEquals("45s", formatDuration(45))
        assertEquals("2m", formatDuration(120))
        assertEquals("2m 30s", formatDuration(150))
        assertEquals("2h 5m", formatDuration(7500))
        assertEquals("2h", formatDuration(7200))
    }

    @Test
    fun dayKeyUtc() {
        assertEquals("1970-01-01", dayKey(0, ZoneOffset.UTC))
        assertEquals("2026-11-14", dayKey(1794614400000L, ZoneOffset.UTC))
    }
}