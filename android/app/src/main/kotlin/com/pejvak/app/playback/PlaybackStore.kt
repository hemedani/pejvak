package com.pejvak.app.playback

import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.Track

/**
 * Persistence the playback engine needs. An interface so the engine is pure and
 * JVM-testable with a fake; the Room-backed implementation lives in the data layer.
 * All writes are local-first; sync is a separate concern (Phase 5).
 */
interface PlaybackStore {
    suspend fun getTrack(id: String): Track?
    suspend fun setTrackDuration(id: String, durationSec: Int)
    suspend fun setTrackAvailability(id: String, availability: String)

    suspend fun insertSession(session: Session)
    suspend fun getSession(id: String): Session?
    suspend fun finalizeSession(id: String, endedAt: Long, endPositionSec: Int, durationListenedSec: Int, completed: Boolean, interrupted: Boolean)
    suspend fun markSessionSeeked(id: String)

    suspend fun updateSessionAudioConditions(
        id: String,
        ambientTone: String,
        ambientLevel: Int,
        volumePercent: Int,
        enhancerEnabled: Boolean,
        enhancerBoostDb: Double,
        enhancerBassDb: Double,
        enhancerTrebleDb: Double,
        at: Long,
    )
    suspend fun updateSessionCollectionOrder(
        id: String,
        sort: com.pejvak.app.domain.CollectionSort,
        direction: com.pejvak.app.domain.SortDirection,
        index: Int,
        size: Int,
        at: Long,
    )

    suspend fun saveCheckpoint(checkpoint: Checkpoint)
    suspend fun deleteCheckpoint(sessionId: String)
    suspend fun getOrphanedCheckpoints(): List<Checkpoint>

    suspend fun getOpenRuns(): List<ContextPlay>
    suspend fun getRun(id: String): ContextPlay?
    suspend fun insertRun(run: ContextPlay)
    suspend fun finalizeRun(id: String, endedAt: Long, completed: Boolean, interrupted: Boolean)
    suspend fun touchRun(id: String, lastIndex: Int, lastTrackId: String?, lastPositionSec: Int, listenedSec: Int, finishedCount: Int, at: Long)
}

/**
 * Transport commands the engine issues to the actual player. The Media3 service
 * implements this with ExoPlayer; tests use a fake. Keeps the engine free of any
 * Android/Media3 import.
 */
interface PlayerCommand {
    /** Whether a live player is bound. False once the media service has stopped,
     *  while the engine singleton still holds a track — the signal to re-load on resume. */
    val isBound: Boolean
    suspend fun loadAndPlay(track: Track, positionSec: Int)
    fun pause()
    fun resume()
    fun seekTo(positionSec: Int)
    fun setSpeed(speed: Double)
    fun setVolume(amplitude: Float)
    fun release()
}