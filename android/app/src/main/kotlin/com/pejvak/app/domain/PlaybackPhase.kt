package com.pejvak.app.domain

/**
 * What the player is doing, and what to say while it is not (mirrors
 * mobile/src/lib/playbackPhase.ts). A wait outranks `playing` (ExoPlayer reports the
 * *intended* state); an error outranks both. Pure — the service owns the wait state.
 */
enum class PlaybackStatus { Idle, Loading, Playing, Paused, Ended, Error }

enum class PlaybackWaitKind { Connecting, Buffering }

data class PlaybackWait(val kind: PlaybackWaitKind, val since: Long, val stream: Boolean)

enum class PlaybackPhase { Idle, Connecting, Buffering, Playing, Paused, Ended, Error }

fun resolvePlaybackPhase(status: PlaybackStatus, waiting: PlaybackWait?, error: String?): PlaybackPhase = when {
    error != null || status == PlaybackStatus.Error -> PlaybackPhase.Error
    status == PlaybackStatus.Idle -> PlaybackPhase.Idle
    waiting != null -> if (waiting.kind == PlaybackWaitKind.Connecting) PlaybackPhase.Connecting else PlaybackPhase.Buffering
    status == PlaybackStatus.Playing -> PlaybackPhase.Playing
    status == PlaybackStatus.Loading -> PlaybackPhase.Connecting
    status == PlaybackStatus.Ended -> PlaybackPhase.Ended
    else -> PlaybackPhase.Paused
}

fun isWaiting(phase: PlaybackPhase): Boolean = phase == PlaybackPhase.Connecting || phase == PlaybackPhase.Buffering

enum class WaitStage { Hidden, Early, Long }

const val WAIT_REVEAL_MS: Long = 400
const val WAIT_LONG_MS: Long = 6000

fun resolveWaitStage(waitedMs: Long): WaitStage = when {
    waitedMs >= WAIT_LONG_MS -> WaitStage.Long
    waitedMs >= WAIT_REVEAL_MS -> WaitStage.Early
    else -> WaitStage.Hidden
}

data class WaitCopy(val label: String, val detail: String?)

fun describeWait(wait: PlaybackWait, stage: WaitStage): WaitCopy {
    val long = stage == WaitStage.Long
    return when {
        wait.kind == PlaybackWaitKind.Buffering -> WaitCopy(
            label = if (long) "Still buffering…" else "Buffering…",
            detail = if (long) "Playback is paused while the next part arrives." else null,
        )
        wait.stream -> WaitCopy(
            label = if (long) "Still connecting…" else "Connecting to the source…",
            detail = if (long) "The source has not answered yet. You can stop and try again." else null,
        )
        else -> WaitCopy(
            label = if (long) "Still preparing…" else "Preparing audio…",
            detail = if (long) "This file is taking longer than usual to open." else null,
        )
    }
}