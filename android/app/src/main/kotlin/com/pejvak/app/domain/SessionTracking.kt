package com.pejvak.app.domain

import kotlin.math.roundToInt

/**
 * Pure session-tracking state machine (mirrors mobile/src/lib/sessionTracking.ts).
 *
 * `durationListenedSec` is the wall-clock listening total, accumulated from playback
 * progress deltas — never endPosition - startPosition:
 *  - normal forward play (0 < delta < 5) adds the delta,
 *  - a seek (delta > 5 or delta < 0) moves the position without adding,
 *  - delta == 5 neither adds nor counts as a seek.
 *
 * The player feeds [applyProgress]; the returned state is persisted (integer seconds)
 * and checkpointed every 10 s of wall-clock time. No Android imports, no polling.
 */
const val SEEK_THRESHOLD_SEC: Int = 5
const val CHECKPOINT_INTERVAL_MS: Long = 10_000

data class SessionTrackerState(
    val sessionId: String,
    val startedAtMs: Long,
    val startPositionSec: Int,
    val lastPositionSec: Double,
    val durationListenedSec: Double,
    val playbackSpeed: Double,
    val lastCheckpointAtMs: Long,
) {
    /** Integer seconds for persistence. */
    val durationListenedSecInt: Int get() = durationListenedSec.roundToInt()
    val lastPositionSecInt: Int get() = lastPositionSec.roundToInt()
}

data class ProgressInput(val positionSec: Double, val atMs: Long)

data class ProgressResult(
    val state: SessionTrackerState,
    val deltaSec: Double,
    val countedSec: Double,
    val isSeek: Boolean,
    val checkpointDue: Boolean,
)

fun createSessionTracker(
    sessionId: String,
    startedAtMs: Long,
    startPositionSec: Double,
    playbackSpeed: Double,
): SessionTrackerState = SessionTrackerState(
    sessionId = sessionId,
    startedAtMs = startedAtMs,
    startPositionSec = startPositionSec.roundToInt(),
    lastPositionSec = startPositionSec,
    durationListenedSec = 0.0,
    playbackSpeed = playbackSpeed,
    lastCheckpointAtMs = startedAtMs,
)

fun applyProgress(state: SessionTrackerState, input: ProgressInput): ProgressResult {
    val deltaSec = input.positionSec - state.lastPositionSec
    val isSeek = deltaSec > SEEK_THRESHOLD_SEC || deltaSec < 0
    val countedSec = if (!isSeek && deltaSec > 0 && deltaSec < SEEK_THRESHOLD_SEC) deltaSec else 0.0
    val checkpointDue = input.atMs - state.lastCheckpointAtMs >= CHECKPOINT_INTERVAL_MS
    return ProgressResult(
        state = state.copy(
            lastPositionSec = input.positionSec,
            durationListenedSec = state.durationListenedSec + countedSec,
            lastCheckpointAtMs = if (checkpointDue) input.atMs else state.lastCheckpointAtMs,
        ),
        deltaSec = deltaSec,
        countedSec = countedSec,
        isSeek = isSeek,
        checkpointDue = checkpointDue,
    )
}