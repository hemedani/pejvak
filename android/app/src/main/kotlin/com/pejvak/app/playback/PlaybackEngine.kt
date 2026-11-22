package com.pejvak.app.playback

import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.PlaybackConditions
import com.pejvak.app.domain.PlaybackPhase
import com.pejvak.app.domain.PlaybackWait
import com.pejvak.app.domain.PlaybackWaitKind
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.SessionTrackerState
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.applyProgress
import com.pejvak.app.domain.createSessionTracker
import com.pejvak.app.domain.orderCollectionTracks
import com.pejvak.app.domain.resolvePlaybackPhase
import com.pejvak.app.domain.PlaybackStatus
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/**
 * The playback orchestrator — the single owner of sessions, runs, stretches and
 * checkpoints (mirrors mobile/src/services/TrackPlayerService.ts). Pure Kotlin: it
 * depends on a [PlaybackStore] (persistence) and a [PlayerCommand] (transport), both
 * interfaces, so the whole lifecycle is JVM-testable with fakes. The Media3 service
 * feeds it player events and implements the commands with ExoPlayer.
 *
 * Invariants: integer seconds persisted; wall-clock listened via the delta rule;
 * checkpoint every 10 s; orphan recovery on launch; sessions append-only; a speed
 * change or deliberate track change splits the session, auto-advance keeps the stretch.
 */
class PlaybackEngine(
    private val store: PlaybackStore,
    private val command: PlayerCommand,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val _openPlayer = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Emitted when the listener starts a track deliberately, so the shell can
     *  surface the full player. Auto-advance never emits. */
    val openPlayer: SharedFlow<Unit> = _openPlayer.asSharedFlow()

    private class ActiveRun(
        val id: String,
        var context: PlaybackContext,
        val trackCount: Int,
        var listenedSec: Int = 0,
        var finishedCount: Int = 0,
    )

    private class ActiveSession(val track: Track, val sessionId: String, var tracker: SessionTrackerState)

    private var currentTrack: Track? = null
    private var active: ActiveSession? = null
    private var activeRun: ActiveRun? = null
    private var activeStretchId: String? = null
    private var pendingStretchId: String? = null
    private var wasPlaying = false
    private var listenedSec = 0.0
    private var nextSessionStartSec = 0
    private var durationReported = false
    private var seekReported = false
    private var advancing = false
    private var awaitingAudio = false

    val sleepTimer = SleepTimer()

    /**
     * Called after a session is finalized (pause, finish, stop). The service uses
     * this to enqueue a sync — a finished session is the highest-value moment to
     * push. Kept as a plain lambda so the engine stays Android-free.
     */
    var onSessionFinalized: (() -> Unit)? = null

    /**
     * Called once when a new session actually starts playing. The service uses it
     * to tell an online source that a station was played (radio play counts).
     */
    var onPlaybackStarted: ((Track) -> Unit)? = null

    /**
     * Supplies the audio-treatment snapshot (tone, volume, enhancer) when a session
     * starts. The service installs this; the engine overlays those fields onto the
     * collection facts it derives from the active run, so a provider that only knows
     * about effects can never erase where the track was played from.
     */
    var conditionsProvider: (() -> PlaybackConditions)? = null

    private fun newId(): String = UUID.randomUUID().toString()
    private fun patch(block: (PlayerState) -> PlayerState) = _state.update(block)

    // --- Recovery -----------------------------------------------------------

    /** Finalize any checkpoint whose session never ended (a kill). Returns the count. */
    suspend fun recoverOrphanedSessions(): Int = mutex.withLock {
        val checkpoints = store.getOrphanedCheckpoints()
        for (cp in checkpoints) {
            var existing = store.getSession(cp.sessionId)
            if (existing == null) {
                val run = cp.contextPlayId?.let { store.getRun(it) }
                store.insertSession(
                    Session(
                        id = cp.sessionId, trackId = cp.trackId, contentHash = cp.contentHash,
                        startedAt = cp.startedAt, startPositionSec = cp.positionSec, playbackSpeed = cp.playbackSpeed,
                        contextPlayId = cp.contextPlayId, contextType = run?.contextType, contextKey = run?.contextKey,
                        stretchId = cp.stretchId ?: cp.sessionId, createdAt = cp.startedAt, updatedAt = cp.startedAt,
                    ),
                )
                existing = store.getSession(cp.sessionId)
            }
            if (existing != null && existing.endedAt == null) {
                store.finalizeSession(cp.sessionId, cp.timestamp, cp.positionSec, cp.durationListenedSec, completed = false, interrupted = true)
            }
            store.deleteCheckpoint(cp.sessionId)
        }
        checkpoints.size
    }

    // --- Runs ---------------------------------------------------------------

    private fun sameContext(a: PlaybackContext, b: PlaybackContext) = a.type == b.type && a.key == b.key

    private suspend fun openRun(context: PlaybackContext, trackCount: Int): String {
        activeRun?.let { if (sameContext(it.context, context)) return it.id }
        val open = store.getOpenRuns()
        val resumable = open.firstOrNull { sameContext(PlaybackContext(it.contextType, it.contextKey, it.contextTitle), context) }
        for (run in open) {
            if (run.id != resumable?.id) store.finalizeRun(run.id, clock(), completed = false, interrupted = true)
        }
        if (resumable != null) {
            activeRun = ActiveRun(resumable.id, context, resumable.trackCount, resumable.listenedSec, resumable.finishedCount)
            return resumable.id
        }
        val id = newId()
        val now = clock()
        store.insertRun(
            ContextPlay(id = id, contextType = context.type, contextKey = context.key, contextTitle = context.title, trackCount = trackCount, startedAt = now, createdAt = now, updatedAt = now),
        )
        activeRun = ActiveRun(id, context, trackCount)
        return id
    }

    private suspend fun closeRun(completed: Boolean, interrupted: Boolean) {
        val run = activeRun ?: return
        activeRun = null
        store.finalizeRun(run.id, clock(), completed, interrupted)
    }

    private suspend fun touchRun(trackId: String, positionSec: Int) {
        val run = activeRun ?: return
        store.touchRun(run.id, _state.value.queueIndex, trackId, positionSec, run.listenedSec, run.finishedCount, clock())
    }

    // --- Sessions -----------------------------------------------------------

    private suspend fun beginSession(track: Track, startPositionSec: Int, speed: Double) {
        if (active != null) return
        val startedAt = clock()
        val run = activeRun
        val handedForward = pendingStretchId != null
        val stretchId = pendingStretchId ?: newId()
        pendingStretchId = null
        activeStretchId = stretchId
        if (!handedForward && listenedSec != 0.0) {
            listenedSec = 0.0
            patch { it.copy(listenedSec = 0) }
        }
        seekReported = false
        val sessionId = newId()
        val inCollection = run != null
        val base = PlaybackConditions(
            contextTitle = run?.context?.title,
            collectionSort = run?.context?.sort ?: CollectionSort.Unknown,
            collectionSortDirection = run?.context?.direction ?: SortDirection.Asc,
            collectionIndex = if (inCollection) _state.value.queueIndex else 0,
            collectionSize = if (inCollection) _state.value.queue.size else 0,
        )
        val provided = runCatching { conditionsProvider?.invoke() }.getOrNull()
        val conditions = provided?.let {
            base.copy(
                ambientTone = it.ambientTone,
                ambientLevel = it.ambientLevel,
                volumePercent = it.volumePercent,
                enhancerEnabled = it.enhancerEnabled,
                enhancerBoostDb = it.enhancerBoostDb,
                enhancerBassDb = it.enhancerBassDb,
                enhancerTrebleDb = it.enhancerTrebleDb,
            )
        } ?: base
        store.insertSession(
            Session(
                id = sessionId, trackId = track.id, contentHash = track.contentHash, startedAt = startedAt,
                startPositionSec = startPositionSec, playbackSpeed = speed,
                contextPlayId = run?.id, contextType = run?.context?.type, contextKey = run?.context?.key,
                contextTitle = if (inCollection) conditions.contextTitle else null,
                collectionSort = if (inCollection) conditions.collectionSort else null,
                collectionSortDirection = if (inCollection) conditions.collectionSortDirection else null,
                collectionIndex = if (inCollection) conditions.collectionIndex else null,
                collectionSize = if (inCollection) conditions.collectionSize else null,
                ambientTone = conditions.ambientTone,
                ambientLevel = conditions.ambientLevel,
                volumePercent = conditions.volumePercent,
                enhancerEnabled = conditions.enhancerEnabled,
                enhancerBoostDb = conditions.enhancerBoostDb,
                enhancerBassDb = conditions.enhancerBassDb,
                enhancerTrebleDb = conditions.enhancerTrebleDb,
                stretchId = stretchId, createdAt = startedAt, updatedAt = startedAt,
            ),
        )
        active = ActiveSession(track, sessionId, createSessionTracker(sessionId, startedAt, startPositionSec.toDouble(), speed))
        runCatching { onPlaybackStarted?.invoke(track) }
    }

    private suspend fun finishSession(completed: Boolean, interrupted: Boolean) {
        val session = active ?: return
        active = null
        activeStretchId = null
        if (completed) activeRun?.let { it.finishedCount += 1 }
        store.finalizeSession(session.sessionId, clock(), session.tracker.lastPositionSecInt, session.tracker.durationListenedSecInt, completed, interrupted)
        store.deleteCheckpoint(session.sessionId)
        patch { it.copy(phase = if (completed) PlaybackPhase.Ended else PlaybackPhase.Paused) }
        runCatching { onSessionFinalized?.invoke() }
    }

    private suspend fun writeCheckpoint() {
        val session = active ?: return
        store.saveCheckpoint(
            Checkpoint(
                id = session.sessionId, sessionId = session.sessionId, trackId = session.track.id, contentHash = session.track.contentHash,
                positionSec = session.tracker.lastPositionSecInt, lastPositionSec = session.tracker.lastPositionSecInt,
                durationListenedSec = session.tracker.durationListenedSecInt, playbackSpeed = session.tracker.playbackSpeed,
                startedAt = session.tracker.startedAtMs, timestamp = clock(), contextPlayId = activeRun?.id, stretchId = activeStretchId,
            ),
        )
        touchRun(session.track.id, session.tracker.lastPositionSecInt)
    }

    private suspend fun reportSeek() {
        val session = active ?: return
        if (seekReported) return
        seekReported = true
        store.markSessionSeeked(session.sessionId)
    }

    // --- Player events ------------------------------------------------------

    /** The per-tick handler (mirrors handleStatus). The service calls this from player events. */
    suspend fun onPlayerProgress(positionSec: Int, durationSec: Int, playing: Boolean, isBuffering: Boolean, atMs: Long) = mutex.withLock {
        val track = currentTrack
        if (durationSec > 0 && track != null && !durationReported) {
            durationReported = true
            store.setTrackDuration(track.id, durationSec)
        }
        patch { it.copy(positionSec = positionSec, durationSec = if (durationSec > 0) durationSec else it.durationSec) }

        // Wait state: a first connect has no session yet; a mid-track stall does.
        val waiting = _state.value.waiting
        if (isBuffering && (awaitingAudio || playing)) {
            if (waiting == null) {
                val kind = if (active != null) PlaybackWaitKind.Buffering else PlaybackWaitKind.Connecting
                val stream = track?.origin == com.pejvak.app.domain.Origin.Online
                patch { it.copy(waiting = PlaybackWait(kind, atMs, stream)) }
            }
        } else if (waiting != null) {
            patch { it.copy(waiting = null) }
        }
        awaitingAudio = false

        if (playing) {
            patch { it.copy(phase = PlaybackPhase.Playing) }
            if (active == null && track != null) {
                val speed = _state.value.playbackSpeed
                val start = if (nextSessionStartSec > 0) nextSessionStartSec else positionSec
                nextSessionStartSec = 0
                beginSession(track, start, speed)
            }
            active?.let { session ->
                val result = applyProgress(session.tracker, com.pejvak.app.domain.ProgressInput(positionSec.toDouble(), atMs))
                session.tracker = result.state
                if (result.countedSec > 0) {
                    listenedSec += result.countedSec
                    activeRun?.let { it.listenedSec += result.countedSec.toInt() }
                    patch { it.copy(listenedSec = listenedSec.toInt()) }
                }
                if (result.checkpointDue) writeCheckpoint()
                if (result.isSeek) reportSeek()
            }
        } else if (wasPlaying) {
            if (active == null) patch { it.copy(phase = PlaybackPhase.Paused) }
            finishSession(completed = false, interrupted = false)
        }
        wasPlaying = playing
        refreshPhase()
    }

    /** The current track finished by itself (not a skip). */
    suspend fun onPlayerFinished() = mutex.withLock {
        if (advancing) return@withLock
        advancing = true
        try {
            val stretch = activeStretchId
            finishSession(completed = true, interrupted = false)
            advanceAfterFinish(stretch)
        } finally {
            advancing = false
        }
    }

    suspend fun onPlayerError(message: String) = mutex.withLock {
        awaitingAudio = false
        patch { it.copy(phase = PlaybackPhase.Error, error = message, waiting = null) }
        val track = currentTrack
        if (track != null && track.origin == com.pejvak.app.domain.Origin.Local) {
            store.setTrackAvailability(track.id, "missing")
        }
    }

    private suspend fun advanceAfterFinish(stretchId: String?) {
        val targetIndex = _state.value.queueIndex + 1
        val targetId = _state.value.queue.getOrNull(targetIndex)
        if (targetId == null) {
            closeRun(completed = true, interrupted = false)
            patch { it.copy(phase = PlaybackPhase.Ended) }
            return
        }
        patch { it.copy(queueIndex = targetIndex) }
        pendingStretchId = stretchId
        val track = store.getTrack(targetId) ?: return
        currentTrack = track
        durationReported = false
        nextSessionStartSec = 0
        patch { it.copy(trackId = track.id, title = track.title, artist = track.author ?: "", artworkUrl = track.artworkUrl, contentHash = track.contentHash, positionSec = 0) }
        command.loadAndPlay(track, 0)
    }

    private fun refreshPhase() {
        val s = _state.value
        val status = when (s.phase) {
            PlaybackPhase.Playing -> PlaybackStatus.Playing
            PlaybackPhase.Paused -> PlaybackStatus.Paused
            PlaybackPhase.Ended -> PlaybackStatus.Ended
            PlaybackPhase.Error -> PlaybackStatus.Error
            PlaybackPhase.Idle -> PlaybackStatus.Idle
            else -> PlaybackStatus.Loading
        }
        val resolved = resolvePlaybackPhase(status, s.waiting, s.error)
        if (resolved != s.phase) patch { it.copy(phase = resolved) }
    }

    // --- Transport intents --------------------------------------------------

    suspend fun loadAndPlay(track: Track, positionSec: Int = 0, context: PlaybackContext? = null, queue: List<String>? = null, index: Int = 0) =
        transportLoadAndPlay(track, positionSec, context, queue, index)

    suspend fun pause() = mutex.withLock { command.pause() }
    suspend fun resume() = mutex.withLock { resumeLocked() }
    suspend fun togglePlayPause() = mutex.withLock { if (_state.value.isPlaying) command.pause() else resumeLocked() }

    /**
     * Resume the current track. When the media service has died (Bluetooth disconnect +
     * background timeout) the singleton still holds the track but no player is bound; a
     * bare resume would be a silent no-op, so re-load the track instead — [PlayerCommand.loadAndPlay]
     * waits for the service the UI has just (re)started to bring a player up.
     */
    private suspend fun resumeLocked() {
        val track = currentTrack
        if (track != null && !command.isBound) {
            command.loadAndPlay(track, _state.value.positionSec)
        } else {
            command.resume()
        }
    }
    suspend fun seekTo(positionSec: Int) = mutex.withLock { command.seekTo(positionSec) }
    suspend fun setSpeed(speed: Double) = mutex.withLock {
        finishSession(completed = false, interrupted = false)
        command.setSpeed(speed)
        patch { it.copy(playbackSpeed = speed) }
    }
    /** Reorders the live collection without interrupting play; patches the active session. */
    suspend fun setCollectionSort(sort: CollectionSort, direction: SortDirection) = mutex.withLock {
        val s = _state.value
        val context = s.context ?: return@withLock
        val currentId = s.trackId ?: return@withLock
        val tracks = s.queue.mapNotNull { store.getTrack(it) }
        if (tracks.size != s.queue.size) return@withLock
        val orderedIds = orderCollectionTracks(tracks, sort, direction).map { it.id }
        if (orderedIds == s.queue && context.sort == sort && context.direction == direction) return@withLock
        val newContext = context.copy(sort = sort, direction = direction)
        activeRun?.context = newContext
        patch { it.copy(queue = orderedIds, queueIndex = orderedIds.indexOf(currentId).coerceAtLeast(0), context = newContext) }
        val sessionId = active?.sessionId ?: return@withLock
        store.updateSessionCollectionOrder(sessionId, sort, direction, orderedIds.indexOf(currentId).coerceAtLeast(0), orderedIds.size, clock())
    }

    /** Copies the live audio-treatment settings onto the playing session, if changed. */
    suspend fun refreshActiveConditions() = mutex.withLock {
        val sessionId = active?.sessionId ?: return@withLock
        val conditions = runCatching { conditionsProvider?.invoke() }.getOrNull() ?: return@withLock
        val current = store.getSession(sessionId) ?: return@withLock
        if (current.ambientTone == conditions.ambientTone &&
            current.ambientLevel == conditions.ambientLevel &&
            current.volumePercent == conditions.volumePercent &&
            current.enhancerEnabled == conditions.enhancerEnabled &&
            current.enhancerBoostDb == conditions.enhancerBoostDb &&
            current.enhancerBassDb == conditions.enhancerBassDb &&
            current.enhancerTrebleDb == conditions.enhancerTrebleDb
        ) return@withLock
        store.updateSessionAudioConditions(
            sessionId,
            conditions.ambientTone,
            conditions.ambientLevel,
            conditions.volumePercent,
            conditions.enhancerEnabled,
            conditions.enhancerBoostDb,
            conditions.enhancerBassDb,
            conditions.enhancerTrebleDb,
            clock(),
        )
    }

    suspend fun setVolume(percent: Int) = mutex.withLock {
        command.setVolume(volumeAmplitude(percent))
        patch { it.copy(volume = percent) }
    }
    suspend fun stop() = mutex.withLock {
        finishSession(completed = false, interrupted = true)
        closeRun(completed = false, interrupted = true)
        command.release()
        currentTrack = null
        wasPlaying = false
        listenedSec = 0.0
        patch { PlayerState(volume = it.volume, playbackSpeed = it.playbackSpeed) }
    }
    /** Appends to the live queue without interrupting playback. */
    suspend fun enqueue(trackIds: List<String>) = mutex.withLock {
        if (trackIds.isEmpty()) return@withLock
        patch { it.copy(queue = it.queue + trackIds) }
    }

    suspend fun next() = skip(1)
    suspend fun previous() = skip(-1)

    suspend fun jumpToQueueIndex(index: Int) = mutex.withLock {
        val s = _state.value
        val target = index.coerceIn(0, (s.queue.size - 1).coerceAtLeast(0))
        if (target == s.queueIndex) return@withLock
        loadQueueIndexLocked(target)
    }

    private suspend fun skip(direction: Int) = mutex.withLock {
        val s = _state.value
        val target = (s.queueIndex + direction).coerceIn(0, (s.queue.size - 1).coerceAtLeast(0))
        if (target == s.queueIndex) return@withLock
        loadQueueIndexLocked(target)
    }

    private suspend fun loadQueueIndexLocked(target: Int) {
        val s = _state.value
        val targetId = s.queue.getOrNull(target) ?: currentTrack?.id ?: return
        finishSession(completed = false, interrupted = true)
        pendingStretchId = null
        val track = store.getTrack(targetId) ?: return
        currentTrack = track
        durationReported = false
        nextSessionStartSec = 0
        seekReported = false
        awaitingAudio = true
        patch {
            it.copy(
                queueIndex = target,
                trackId = track.id,
                title = track.title,
                artist = track.author ?: "",
                artworkUrl = track.artworkUrl,
                contentHash = track.contentHash,
                positionSec = 0,
                error = null,
                phase = PlaybackPhase.Connecting,
                waiting = PlaybackWait(PlaybackWaitKind.Connecting, clock(), track.origin == com.pejvak.app.domain.Origin.Online),
            )
        }
        command.loadAndPlay(track, 0)
    }

    internal suspend fun transportLoadAndPlay(track: Track, positionSec: Int, context: PlaybackContext?, queue: List<String>?, index: Int) = mutex.withLock {
        finishSession(completed = false, interrupted = true)
        currentTrack = track
        val newQueue = queue ?: listOf(track.id)
        val newIndex = if (queue != null) index else 0
        patch { it.copy(queue = newQueue, queueIndex = newIndex, context = context, trackId = track.id, title = track.title, artist = track.author ?: "", artworkUrl = track.artworkUrl, contentHash = track.contentHash, positionSec = positionSec, error = null) }
        if (context != null) openRun(context, newQueue.size) else closeRun(completed = false, interrupted = true)
        nextSessionStartSec = positionSec
        durationReported = false
        seekReported = false
        awaitingAudio = true
        patch { it.copy(phase = PlaybackPhase.Connecting, waiting = PlaybackWait(PlaybackWaitKind.Connecting, clock(), track.origin == com.pejvak.app.domain.Origin.Online)) }
        command.loadAndPlay(track, positionSec)
        _openPlayer.tryEmit(Unit)
    }
}