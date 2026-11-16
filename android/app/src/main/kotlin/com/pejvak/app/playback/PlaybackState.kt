package com.pejvak.app.playback

import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.PlaybackPhase
import com.pejvak.app.domain.PlaybackWait

/** The collection a queue belongs to (a run's context). */
data class PlaybackContext(val type: ContextType, val key: String, val title: String)

/**
 * The observable player state the UI draws. The engine is the single writer; the
 * 1 Hz position tick belongs to leaf composables (Phase 6), not the whole tree.
 */
data class PlayerState(
    val phase: PlaybackPhase = PlaybackPhase.Idle,
    val trackId: String? = null,
    val title: String = "",
    val artist: String = "",
    val artworkUrl: String? = null,
    val contentHash: String? = null,
    val positionSec: Int = 0,
    val durationSec: Int = 0,
    val listenedSec: Int = 0,
    val playbackSpeed: Double = 1.0,
    val volume: Int = 100,
    val waiting: PlaybackWait? = null,
    val error: String? = null,
    val queue: List<String> = emptyList(),
    val queueIndex: Int = 0,
    val context: PlaybackContext? = null,
) {
    val isPlaying: Boolean get() = phase == PlaybackPhase.Playing
    val hasTrack: Boolean get() = trackId != null
}