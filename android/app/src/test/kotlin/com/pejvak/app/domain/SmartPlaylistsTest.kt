package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartPlaylistsTest {

    private val now = 1_000_000_000_000L
    private val day = 86_400_000L

    private fun track(id: String, durationSec: Int = 600, folderKey: String? = null, availability: Availability = Availability.Present) =
        Track(id = id, contentHash = "h$id", title = "Track $id", durationSec = durationSec, folderKey = folderKey, availability = availability, createdAt = now, updatedAt = now)

    private fun endedSession(trackId: String, startedAt: Long, endPositionSec: Int, completed: Boolean = false, durationListenedSec: Int = 100) =
        Session(
            id = "s$trackId$startedAt", trackId = trackId, contentHash = "h", startedAt = startedAt,
            endedAt = startedAt + 100, endPositionSec = endPositionSec, durationListenedSec = durationListenedSec,
            completed = completed, stretchId = "s$trackId$startedAt", createdAt = startedAt, updatedAt = startedAt,
        )

    private fun context(tracks: List<Track>, sessions: List<Session> = emptyList(), notes: Map<String, Int> = emptyMap()) =
        SmartContext(tracks, sessions, notes, now)

    @Test
    fun continuePicksUpPartwayTracks() {
        val t = track("a", durationSec = 600)
        val sessions = listOf(endedSession("a", now - day, endPositionSec = 120))
        val result = buildSmartPlaylist(SmartRuleId.Continue, context(listOf(t), sessions))
        assertEquals(1, result.picks.size)
        assertTrue(result.picks.first().reason.contains("Left off at"))
    }

    @Test
    fun continueExcludesFinished() {
        val t = track("a", durationSec = 600)
        val sessions = listOf(endedSession("a", now - day, endPositionSec = 595, completed = true))
        val result = buildSmartPlaylist(SmartRuleId.Continue, context(listOf(t), sessions))
        assertTrue(result.picks.isEmpty())
        assertTrue(result.emptyReason != null)
    }

    @Test
    fun commuteFillsBudgetLongestFirst() {
        val tracks = listOf(track("short", 300), track("long", 1500), track("mid", 900))
        val result = buildSmartPlaylist(SmartRuleId.Commute, context(tracks), SmartPlaylistOptions(budgetSec = 1800))
        // Longest (1500) fits and is taken first; 300 also fits (1800 total).
        assertEquals(listOf("long", "short"), result.picks.map { it.track.id })
    }

    @Test
    fun commuteExcludesUnknownDuration() {
        val tracks = listOf(track("nodur", durationSec = 0))
        val result = buildSmartPlaylist(SmartRuleId.Commute, context(tracks), SmartPlaylistOptions(budgetSec = 1800))
        assertTrue(result.picks.isEmpty())
    }

    @Test
    fun forgottenNeedsPlaysAndAbsence() {
        val t = track("a")
        val old = now - 30 * day
        val sessions = listOf(endedSession("a", old, 100), endedSession("a", old + 1000, 100))
        val result = buildSmartPlaylist(SmartRuleId.Forgotten, context(listOf(t), sessions))
        assertEquals(1, result.picks.size)
    }

    @Test
    fun forgottenExcludesRecent() {
        val t = track("a")
        val sessions = listOf(endedSession("a", now - day, 100), endedSession("a", now - day + 1000, 100))
        val result = buildSmartPlaylist(SmartRuleId.Forgotten, context(listOf(t), sessions))
        assertTrue(result.picks.isEmpty())
    }

    @Test
    fun reviewRanksAnnotatedTracks() {
        val tracks = listOf(track("a"), track("b"))
        val result = buildSmartPlaylist(SmartRuleId.Review, context(tracks, notes = mapOf("a" to 3)))
        assertEquals(listOf("a"), result.picks.map { it.track.id })
    }

    @Test
    fun seriesFollowsFolderOrder() {
        val tracks = listOf(
            track("1", folderKey = "Lectures", ).copy(trackNumber = 1, fileName = "01.mp3"),
            track("2", folderKey = "Lectures").copy(trackNumber = 2, fileName = "02.mp3"),
            track("3", folderKey = "Lectures").copy(trackNumber = 3, fileName = "03.mp3"),
        )
        val sessions = listOf(endedSession("1", now - day, 600, completed = true))
        val result = buildSmartPlaylist(SmartRuleId.Series, context(tracks, sessions))
        assertEquals(listOf("2", "3"), result.picks.map { it.track.id })
    }

    @Test
    fun missingTracksAreNotPlayable() {
        val t = track("a", availability = Availability.Missing)
        val sessions = listOf(endedSession("a", now - day, 120))
        val result = buildSmartPlaylist(SmartRuleId.Continue, context(listOf(t), sessions))
        assertTrue(result.picks.isEmpty())
    }

    @Test
    fun forgottenScoreFormula() {
        assertEquals(2 * (kotlin.math.ln(2.0 + 10) / kotlin.math.ln(2.0)), forgottenScore(2, 10), 0.0001)
    }

    @Test
    fun historyIndexCountsFinalizedOnly() {
        val t = track("a", 600)
        val open = Session(id = "o", trackId = "a", contentHash = "h", startedAt = now, endedAt = null, stretchId = "o", createdAt = now, updatedAt = now)
        val closed = endedSession("a", now - day, 120)
        val index = buildTrackHistoryIndex(listOf(open, closed), listOf(t))
        assertEquals(1, index["a"]!!.playCount)
        assertEquals(120, index["a"]!!.resumeSec)
    }

    @Test
    fun allFiveRulesBuildOverOneIndex() {
        val results = buildSmartPlaylists(SmartRuleId.entries, context(listOf(track("a"))))
        assertEquals(5, results.size)
    }
}