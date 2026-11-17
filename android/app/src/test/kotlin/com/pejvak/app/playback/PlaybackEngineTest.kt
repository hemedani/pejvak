package com.pejvak.app.playback

import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.Track
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** In-memory fakes so the whole engine lifecycle runs on the JVM. */
private class FakeStore : PlaybackStore {
    val tracks = LinkedHashMap<String, Track>()
    val sessions = LinkedHashMap<String, Session>()
    val checkpoints = LinkedHashMap<String, Checkpoint>()
    val runs = LinkedHashMap<String, ContextPlay>()

    override suspend fun getTrack(id: String) = tracks[id]
    override suspend fun setTrackDuration(id: String, durationSec: Int) { tracks[id]?.let { tracks[id] = it.copy(durationSec = durationSec) } }
    override suspend fun setTrackAvailability(id: String, availability: String) { tracks[id]?.let { tracks[id] = it.copy(availability = com.pejvak.app.domain.Availability.from(availability)) } }
    override suspend fun insertSession(session: Session) { sessions[session.id] = session }
    override suspend fun getSession(id: String) = sessions[id]
    override suspend fun finalizeSession(id: String, endedAt: Long, endPositionSec: Int, durationListenedSec: Int, completed: Boolean, interrupted: Boolean) {
        sessions[id]?.let { sessions[id] = it.copy(endedAt = endedAt, endPositionSec = endPositionSec, durationListenedSec = durationListenedSec, completed = completed, interrupted = interrupted) }
    }
    override suspend fun markSessionSeeked(id: String) { sessions[id]?.let { sessions[id] = it.copy(seeked = true) } }
    override suspend fun saveCheckpoint(checkpoint: Checkpoint) { checkpoints[checkpoint.sessionId] = checkpoint }
    override suspend fun deleteCheckpoint(sessionId: String) { checkpoints.remove(sessionId) }
    override suspend fun getOrphanedCheckpoints() = checkpoints.values.filter { sessions[it.sessionId]?.endedAt == null }
    override suspend fun getOpenRuns() = runs.values.filter { it.endedAt == null && it.deletedAt == null }
    override suspend fun getRun(id: String) = runs[id]
    override suspend fun insertRun(run: ContextPlay) { runs[run.id] = run }
    override suspend fun finalizeRun(id: String, endedAt: Long, completed: Boolean, interrupted: Boolean) {
        runs[id]?.let { runs[id] = it.copy(endedAt = endedAt, completed = completed, interrupted = interrupted) }
    }
    override suspend fun touchRun(id: String, lastIndex: Int, lastTrackId: String?, lastPositionSec: Int, listenedSec: Int, finishedCount: Int, at: Long) {
        runs[id]?.let { runs[id] = it.copy(lastIndex = lastIndex, lastTrackId = lastTrackId, lastPositionSec = lastPositionSec, listenedSec = listenedSec, finishedCount = finishedCount) }
    }
}

private class FakeCommand : PlayerCommand {
    var loaded: Pair<Track, Int>? = null
    var pauseCount = 0
    var resumeCount = 0
    var released = false
    override suspend fun loadAndPlay(track: Track, positionSec: Int) { loaded = track to positionSec }
    override fun pause() { pauseCount++ }
    override fun resume() { resumeCount++ }
    override fun seekTo(positionSec: Int) {}
    override fun setSpeed(speed: Double) {}
    override fun setVolume(amplitude: Float) {}
    override fun release() { released = true }
}

@OptIn(ExperimentalCoroutinesApi::class)
class PlaybackEngineTest {

    private fun track(id: String, durationSec: Int = 600) =
        Track(id = id, contentHash = "h$id", title = "Track $id", fileUri = "file:///$id.mp3", durationSec = durationSec, createdAt = 0, updatedAt = 0)

    private fun setup(): Triple<PlaybackEngine, FakeStore, FakeCommand> {
        val store = FakeStore()
        val cmd = FakeCommand()
        val engine = PlaybackEngine(store, cmd) { 1000L }
        return Triple(engine, store, cmd)
    }

    @Test
    fun deliberateStartRequestsPlayerButQueueSkipDoesNot() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1"); val t2 = track("t2")
        store.tracks["t1"] = t1; store.tracks["t2"] = t2
        var opens = 0

        val listener = launch(UnconfinedTestDispatcher(testScheduler)) {
            engine.openPlayer.collect { opens++ }
        }
        engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)
        assertEquals(1, opens)
        engine.next()
        assertEquals("queue skips must not reopen the player", 1, opens)
        listener.cancel()
    }

    @Test
    fun sessionBeginsOnPlayAndFinalizesOnPause() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, playing = true, isBuffering = false, atMs = 1000)
        assertEquals(1, store.sessions.size)
        engine.onPlayerProgress(3, 600, true, false, 4000)
        engine.onPlayerProgress(4, 600, true, false, 5000)
        engine.onPlayerProgress(4, 600, playing = false, isBuffering = false, atMs = 5000)
        val s = store.sessions.values.first()
        assertNotNull(s.endedAt)
        assertEquals(4, s.durationListenedSec)
        assertEquals(4, s.endPositionSec)
    }

    @Test
    fun sessionFinalizedCallbackFiresWhenPaused() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        var fired = 0
        engine.onSessionFinalized = { fired++ }
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, playing = true, isBuffering = false, atMs = 1000)
        engine.onPlayerProgress(3, 600, playing = true, isBuffering = false, atMs = 4000)
        engine.onPlayerProgress(3, 600, playing = false, isBuffering = false, atMs = 4000)
        assertEquals(1, fired)
    }

    @Test
    fun playbackStartedCallbackFiresOnceWhenARadioSessionBegins() = runTest {
        val (engine, store, _) = setup()
        val radio = track("r1").copy(
            origin = com.pejvak.app.domain.Origin.Online,
            sourceId = "radiobrowser",
            externalId = "station-de",
        )
        store.tracks["r1"] = radio
        val started = ArrayList<String>()
        engine.onPlaybackStarted = { started.add("${it.sourceId}:${it.externalId}") }
        engine.loadAndPlay(radio, 0)
        engine.onPlayerProgress(0, 600, playing = true, isBuffering = false, atMs = 1000)
        engine.onPlayerProgress(2, 600, playing = true, isBuffering = false, atMs = 3000)
        assertEquals(listOf("radiobrowser:station-de"), started)
    }

    @Test
    fun seekDoesNotAddListenTimeAndMarksSeeked() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.onPlayerProgress(2, 600, true, false, 3000)
        engine.onPlayerProgress(100, 600, true, false, 4000) // seek
        engine.onPlayerProgress(100, 600, playing = false, isBuffering = false, atMs = 4000) // pause → finalize
        val s = store.sessions.values.first()
        assertEquals(2, s.durationListenedSec)
        assertTrue(s.seeked)
    }

    @Test
    fun checkpointWrittenAfterTenSeconds() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.onPlayerProgress(5, 600, true, false, 6000)
        assertTrue(store.checkpoints.isEmpty())
        engine.onPlayerProgress(9, 600, true, false, 11000) // 10s since start
        assertEquals(1, store.checkpoints.size)
    }

    @Test
    fun recoveryFinalizesOrphanAsInterrupted() = runTest {
        val store = FakeStore()
        var now = 1000L
        val engine = PlaybackEngine(store, FakeCommand()) { now }
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        now = 11000L
        engine.onPlayerProgress(9, 600, true, false, 11000) // checkpoint, session still open
        // Simulate a kill: a fresh engine recovers from the store.
        val recovered = PlaybackEngine(store, FakeCommand()) { 20000L }
        val count = recovered.recoverOrphanedSessions()
        assertEquals(1, count)
        val s = store.sessions.values.first()
        assertNotNull(s.endedAt)
        assertTrue(s.interrupted)
        assertEquals(11000L, s.endedAt)
        assertTrue(store.checkpoints.isEmpty())
    }

    @Test
    fun autoAdvanceKeepsTheStretch() = runTest {
        val (engine, store, cmd) = setup()
        val t1 = track("t1"); val t2 = track("t2")
        store.tracks["t1"] = t1; store.tracks["t2"] = t2
        engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val firstStretch = store.sessions.values.first().stretchId
        engine.onPlayerFinished() // t1 ends by itself
        assertEquals("t2", cmd.loaded?.first?.id)
        engine.onPlayerProgress(0, 600, true, false, 2000) // t2 begins
        val stretches = store.sessions.values.map { it.stretchId }
        assertEquals(2, stretches.size)
        assertEquals(firstStretch, stretches[1]) // same stretch
    }

    @Test
    fun manualSkipStartsANewStretch() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1"); val t2 = track("t2")
        store.tracks["t1"] = t1; store.tracks["t2"] = t2
        engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val firstStretch = store.sessions.values.first().stretchId
        engine.next() // deliberate skip
        engine.onPlayerProgress(0, 600, true, false, 2000)
        val stretches = store.sessions.values.map { it.stretchId }
        assertNotEquals(firstStretch, stretches[1])
    }

    @Test
    fun jumpWithinQueueKeepsTheRunAndStartsANewStretch() = runTest {
        val (engine, store, cmd) = setup()
        val t1 = track("t1"); val t2 = track("t2"); val t3 = track("t3")
        store.tracks["t1"] = t1; store.tracks["t2"] = t2; store.tracks["t3"] = t3
        val context = PlaybackContext(ContextType.Folder, "Lectures", "Lectures")
        engine.loadAndPlay(t1, 0, context = context, queue = listOf("t1", "t2", "t3"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val firstStretch = store.sessions.values.first().stretchId
        engine.jumpToQueueIndex(2)
        assertEquals("t3", cmd.loaded?.first?.id)
        assertEquals(2, engine.state.value.queueIndex)
        assertEquals(1, store.runs.size)
        assertEquals(null, store.runs.values.first().endedAt)
        engine.onPlayerProgress(0, 600, true, false, 2000)
        assertNotEquals(firstStretch, store.sessions.values.last().stretchId)
    }

    @Test
    fun runOpensAndCompletesWhenQueueExhausted() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1"); store.tracks["t1"] = t1
        val context = PlaybackContext(ContextType.Folder, "Lectures", "Lectures")
        engine.loadAndPlay(t1, 0, context = context, queue = listOf("t1"), index = 0)
        assertEquals(1, store.runs.size)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.onPlayerFinished() // only track ends → run completes
        val run = store.runs.values.first()
        assertNotNull(run.endedAt)
        assertTrue(run.completed)
    }

    @Test
    fun speedChangeSplitsSession() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.onPlayerProgress(2, 600, true, false, 3000)
        engine.setSpeed(1.5)
        assertEquals(1, store.sessions.size) // first finalized
        assertNotNull(store.sessions.values.first().endedAt)
        engine.onPlayerProgress(3, 600, true, false, 4000) // new session at 1.5x
        assertEquals(2, store.sessions.size)
        assertEquals(1.5, store.sessions.values.last().playbackSpeed, 0.0001)
    }

    @Test
    fun stopReleasesPlayerAndClosesRun() = runTest {
        val (engine, store, cmd) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0, context = PlaybackContext(ContextType.Playlist, "p1", "P"), queue = listOf("t1"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.stop()
        assertTrue(cmd.released)
        assertNull(engine.state.value.trackId)
        assertTrue(store.runs.values.first().interrupted)
    }

    @Test
    fun durationWrittenBackOnce() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1", durationSec = 0); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        assertEquals(600, store.tracks["t1"]!!.durationSec)
    }
}