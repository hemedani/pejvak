package com.pejvak.app.playback

import com.pejvak.app.data.repository.AudioEffectsState
import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.PlaybackConditions
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.capturedAmbientTone
import com.pejvak.app.domain.playbackAmbienceValue
import com.pejvak.app.domain.playbackConditions
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
    var conditionWrites = 0
    var orderWrites = 0
    override suspend fun markSessionSeeked(id: String) { sessions[id]?.let { sessions[id] = it.copy(seeked = true) } }
    override suspend fun updateSessionAudioConditions(
        id: String,
        ambientTone: String,
        ambientLevel: Int,
        volumePercent: Int,
        enhancerEnabled: Boolean,
        enhancerBoostDb: Double,
        enhancerBassDb: Double,
        enhancerTrebleDb: Double,
        at: Long,
    ) {
        conditionWrites++
        sessions[id]?.let {
            sessions[id] = it.copy(
                ambientTone = ambientTone,
                ambientLevel = ambientLevel,
                volumePercent = volumePercent,
                enhancerEnabled = enhancerEnabled,
                enhancerBoostDb = enhancerBoostDb,
                enhancerBassDb = enhancerBassDb,
                enhancerTrebleDb = enhancerTrebleDb,
                updatedAt = at,
                syncStatus = com.pejvak.app.domain.SyncStatus.Pending,
            )
        }
    }
    override suspend fun updateSessionCollectionOrder(
        id: String,
        sort: com.pejvak.app.domain.CollectionSort,
        direction: com.pejvak.app.domain.SortDirection,
        index: Int,
        size: Int,
        at: Long,
    ) {
        orderWrites++
        sessions[id]?.let {
            sessions[id] = it.copy(
                collectionSort = sort,
                collectionSortDirection = direction,
                collectionIndex = index,
                collectionSize = size,
                updatedAt = at,
                syncStatus = com.pejvak.app.domain.SyncStatus.Pending,
            )
        }
    }
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
    var loadCount = 0
    var pauseCount = 0
    var resumeCount = 0
    var released = false
    var bound = true
    override val isBound: Boolean get() = bound
    override suspend fun loadAndPlay(track: Track, positionSec: Int) { loaded = track to positionSec; loadCount++ }
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
    fun aBufferStallDoesNotSplitOrFinalizeTheSession() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, playing = true, isBuffering = false, atMs = 1000)
        engine.onPlayerProgress(3, 600, playing = true, isBuffering = false, atMs = 4000)
        // A stream stalls: not playing, buffering. The session must survive.
        engine.onPlayerProgress(3, 600, playing = false, isBuffering = true, atMs = 5000)
        engine.onPlayerProgress(3, 600, playing = false, isBuffering = true, atMs = 6000)
        assertEquals("a stall must not split the session", 1, store.sessions.size)
        assertNull("a stall must not finalize the session", store.sessions.values.first().endedAt)
        // Resumes, then a real pause finalizes the one session.
        engine.onPlayerProgress(4, 600, playing = true, isBuffering = false, atMs = 7000)
        engine.onPlayerProgress(4, 600, playing = false, isBuffering = false, atMs = 8000)
        assertEquals(1, store.sessions.size)
        assertNotNull(store.sessions.values.first().endedAt)
        assertEquals(4, store.sessions.values.first().durationListenedSec)
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
    fun loadSeedsDurationFromTrackSoTheTimelineWorksBeforeThePlayerReports() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1", durationSec = 468)
        store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        assertEquals(468, engine.state.value.durationSec)
        engine.onPlayerProgress(0, 0, playing = true, isBuffering = true, atMs = 1000)
        assertEquals("a zero report must not erase the seeded duration", 468, engine.state.value.durationSec)
        engine.onPlayerProgress(0, 470, playing = true, isBuffering = false, atMs = 2000)
        assertEquals(470, engine.state.value.durationSec)
    }

    @Test
    fun queueSkipSeedsDurationFromTheNextTrack() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1", durationSec = 120); val t2 = track("t2", durationSec = 300)
        store.tracks["t1"] = t1; store.tracks["t2"] = t2
        engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)
        engine.onPlayerProgress(0, 120, playing = true, isBuffering = false, atMs = 1000)
        engine.next()
        assertEquals(300, engine.state.value.durationSec)
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
    fun resumeWithALivePlayerJustResumes() = runTest {
        val (engine, store, cmd) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.pause()
        engine.onPlayerProgress(120, 600, false, false, 2000)
        cmd.resumeCount = 0; cmd.loadCount = 0
        engine.resume()
        assertEquals(1, cmd.resumeCount)
        assertEquals(0, cmd.loadCount)
    }

    @Test
    fun resumeReLoadsTheTrackWhenThePlayerDied() = runTest {
        val (engine, store, cmd) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        // The media service stops itself after a Bluetooth disconnect: no player bound,
        // but the singleton still holds the track at its last position.
        engine.onPlayerProgress(180, 600, false, false, 2000)
        cmd.bound = false
        cmd.resumeCount = 0; cmd.loadCount = 0
        engine.resume()
        assertEquals("bare resume must not be issued against a dead player", 0, cmd.resumeCount)
        assertEquals("the current track must be re-loaded", t to 180, cmd.loaded)
        assertEquals(1, cmd.loadCount)
    }

    @Test
    fun togglePlayPauseReLoadsWhenUnbound() = runTest {
        val (engine, store, cmd) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.onPlayerProgress(90, 600, false, false, 2000)
        cmd.bound = false
        cmd.resumeCount = 0; cmd.loadCount = 0
        engine.togglePlayPause()
        assertEquals(0, cmd.resumeCount)
        assertEquals(t to 90, cmd.loaded)
        assertEquals(1, cmd.loadCount)
    }

    @Test
    fun sessionCapturesPlaybackConditions() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1")
        val t2 = track("t2")
        store.tracks["t1"] = t1
        store.tracks["t2"] = t2
        engine.conditionsProvider = {
            PlaybackConditions(
                ambientTone = "forest",
                ambientLevel = 35,
                volumePercent = 70,
                enhancerEnabled = true,
                enhancerBoostDb = 3.0,
                enhancerBassDb = 2.0,
                enhancerTrebleDb = 1.0,
            )
        }
        val context = PlaybackContext(
            ContextType.Playlist,
            "p1",
            "Morning",
            com.pejvak.app.domain.CollectionSort.Manual,
        )
        engine.loadAndPlay(t1, 0, context = context, queue = listOf("t1", "t2"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val conditions = store.sessions.values.first().playbackConditions()
        // Collection facts survive even though the provider only supplied audio fields.
        assertEquals("Morning", conditions.contextTitle)
        assertEquals(com.pejvak.app.domain.CollectionSort.Manual, conditions.collectionSort)
        assertEquals(0, conditions.collectionIndex)
        assertEquals(2, conditions.collectionSize)
        assertEquals("forest", conditions.ambientTone)
        assertEquals(35, conditions.ambientLevel)
        assertEquals(70, conditions.volumePercent)
        assertTrue(conditions.enhancerEnabled)
        assertEquals(3.0, conditions.enhancerBoostDb, 0.0001)
        assertEquals(2.0, conditions.enhancerBassDb, 0.0001)
        assertEquals(1.0, conditions.enhancerTrebleDb, 0.0001)
    }

    @Test
    fun `default effects state captures no ambience when the level is off`() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        val effects = AudioEffectsState()
        assertEquals("room", effects.toneId)
        assertEquals(0, effects.toneLevel)
        engine.conditionsProvider = {
            PlaybackConditions(
                ambientTone = capturedAmbientTone(effects.toneId, effects.toneLevel),
                ambientLevel = effects.toneLevel,
            )
        }
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val stored = store.sessions.values.first()
        assertEquals("none", stored.ambientTone)
        assertEquals(0, stored.ambientLevel)
        assertNull(playbackAmbienceValue(stored.playbackConditions()))
    }

    @Test
    fun `standalone session records no collection position`() = runTest {
        val (engine, store, _) = setup()
        val t1 = track("t1"); val t2 = track("t2")
        store.tracks["t1"] = t1; store.tracks["t2"] = t2
        engine.loadAndPlay(t1, 0, queue = listOf("t1", "t2"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val stored = store.sessions.values.first()
        assertNull(stored.contextTitle)
        assertNull(stored.collectionSort)
        assertNull(stored.collectionSortDirection)
        assertNull(stored.collectionIndex)
        assertNull(stored.collectionSize)
    }

    @Test
    fun `resume with a real run records a one track queue`() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        val context = PlaybackContext(ContextType.Playlist, "p1", "Morning", CollectionSort.Manual)
        engine.loadAndPlay(t, 0, context = context, queue = listOf("t1"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val stored = store.sessions.values.first()
        assertEquals("Morning", stored.contextTitle)
        assertEquals(CollectionSort.Manual, stored.collectionSort)
        assertEquals(0, stored.collectionIndex)
        assertEquals(1, stored.collectionSize)
    }

    @Test
    fun `throwing conditions provider falls back to the base snapshot`() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.conditionsProvider = { error("provider failed") }
        val context = PlaybackContext(ContextType.Playlist, "p1", "Morning", CollectionSort.Manual)
        engine.loadAndPlay(t, 0, context = context, queue = listOf("t1"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val conditions = store.sessions.values.first().playbackConditions()
        assertEquals("Morning", conditions.contextTitle)
        assertEquals(CollectionSort.Manual, conditions.collectionSort)
        assertEquals(100, conditions.volumePercent)
        assertEquals(0, conditions.ambientLevel)
        assertEquals("none", conditions.ambientTone)
    }

    @Test
    fun `collection sort reorders the live queue and keeps the current track playing`() = runTest {
        val (engine, store, cmd) = setup()
        val tracks = listOf(
            track("b").copy(title = "Beta"),
            track("a").copy(title = "Alpha"),
            track("c").copy(title = "Gamma"),
        )
        tracks.forEach { store.tracks[it.id] = it }
        val context = PlaybackContext(ContextType.Folder, "f1", "Lectures", CollectionSort.Folder)
        engine.loadAndPlay(tracks[0], 30, context = context, queue = listOf("b", "a", "c"), index = 0)
        engine.onPlayerProgress(30, 600, true, false, 1000)
        val loadsBefore = cmd.loadCount

        engine.setCollectionSort(CollectionSort.Name, com.pejvak.app.domain.SortDirection.Asc)

        assertEquals(listOf("a", "b", "c"), engine.state.value.queue)
        assertEquals("b", engine.state.value.trackId)
        assertEquals(1, engine.state.value.queueIndex)
        assertEquals(CollectionSort.Name, engine.state.value.context?.sort)
        assertEquals(loadsBefore, cmd.loadCount)
        assertEquals(30, engine.state.value.positionSec)
    }

    @Test
    fun `collection sort patches the active session order`() = runTest {
        val (engine, store, _) = setup()
        val tracks = listOf(track("b"), track("a"), track("c"))
        tracks.forEach { store.tracks[it.id] = it }
        val context = PlaybackContext(ContextType.Folder, "f1", "Lectures", CollectionSort.Folder)
        engine.loadAndPlay(tracks[0], 0, context = context, queue = listOf("b", "a", "c"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)

        engine.setCollectionSort(CollectionSort.Name, com.pejvak.app.domain.SortDirection.Desc)

        val session = store.sessions.values.first()
        assertEquals(CollectionSort.Name, session.collectionSort)
        assertEquals(com.pejvak.app.domain.SortDirection.Desc, session.collectionSortDirection)
        assertEquals(1, session.collectionIndex)
        assertEquals(3, session.collectionSize)
        assertEquals(com.pejvak.app.domain.SyncStatus.Pending, session.syncStatus)
        assertEquals(listOf("c", "b", "a"), engine.state.value.queue)
        assertEquals(1, engine.state.value.queueIndex)
    }

    @Test
    fun `refresh active conditions patches only the playing session`() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        var conditions = PlaybackConditions(volumePercent = 100)
        engine.conditionsProvider = { conditions }
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        conditions = PlaybackConditions(volumePercent = 55, ambientTone = "forest", ambientLevel = 20)

        engine.refreshActiveConditions()

        val session = store.sessions.values.first()
        assertEquals(55, session.volumePercent)
        assertEquals("forest", session.ambientTone)
        assertEquals(20, session.ambientLevel)
        assertEquals(1, store.sessions.size)
    }

    @Test
    fun `identical condition snapshots do not write again`() = runTest {
        val (engine, store, _) = setup()
        val t = track("t1"); store.tracks["t1"] = t
        engine.conditionsProvider = { PlaybackConditions(volumePercent = 70) }
        engine.loadAndPlay(t, 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        val writesAfterStart = store.conditionWrites

        engine.refreshActiveConditions()
        engine.refreshActiveConditions()

        assertEquals(writesAfterStart, store.conditionWrites)
    }

    @Test
    fun `next session captures the reordered collection position`() = runTest {
        val (engine, store, _) = setup()
        val tracks = listOf(
            track("b").copy(title = "Beta"),
            track("a").copy(title = "Alpha"),
            track("c").copy(title = "Gamma"),
        )
        tracks.forEach { store.tracks[it.id] = it }
        val context = PlaybackContext(ContextType.Folder, "f1", "Lectures", CollectionSort.Folder)
        engine.loadAndPlay(tracks[0], 0, context = context, queue = listOf("b", "a", "c"), index = 0)
        engine.onPlayerProgress(0, 600, true, false, 1000)
        engine.setCollectionSort(CollectionSort.Name, com.pejvak.app.domain.SortDirection.Asc)
        engine.onPlayerFinished()
        engine.onPlayerProgress(0, 600, true, false, 2000)

        val second = store.sessions.values.last()
        assertEquals("c", second.trackId)
        assertEquals(CollectionSort.Name, second.collectionSort)
        assertEquals(2, second.collectionIndex)
        assertEquals(3, second.collectionSize)
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