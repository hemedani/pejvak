package com.pejvak.app.domain

/**
 * The listening stretch — one continuous listen across tracks (mirrors
 * mobile/src/lib/listeningStretch.ts). Nothing is stored; a stretch is its member
 * sessions read together. Scrubbing and auto-advance do not cut it; a deliberate
 * track change does. Pure.
 */
data class ListeningStretch(
    val id: String,
    val startedAt: Long,
    val endedAt: Long?,
    val startTrackId: String,
    val startPositionSec: Int,
    val endTrackId: String,
    val endPositionSec: Int?,
    val trackCount: Int,
    val listenedSec: Int,
    val playbackSpeed: Double,
    val seeked: Boolean,
    val completed: Boolean,
    val interrupted: Boolean,
    val contextPlayId: String?,
    val contextType: ContextType?,
    val contextKey: String?,
    val members: List<Session>,
    val isComplete: Boolean,
)

enum class StretchOutcome { Complete, Finished, Interrupted, Open }

fun buildStretch(members: List<Session>): ListeningStretch? {
    val ordered = members.sortedBy { it.startedAt }
    val first = ordered.firstOrNull() ?: return null
    val last = ordered.last()
    val seeked = ordered.any { it.seeked }
    val completed = last.completed
    val endedAt = last.endedAt
    return ListeningStretch(
        id = first.stretchId,
        startedAt = first.startedAt,
        endedAt = endedAt,
        startTrackId = first.trackId,
        startPositionSec = first.startPositionSec,
        endTrackId = last.trackId,
        endPositionSec = last.endPositionSec,
        trackCount = ordered.size,
        listenedSec = ordered.sumOf { it.durationListenedSec },
        playbackSpeed = first.playbackSpeed,
        seeked = seeked,
        completed = completed,
        interrupted = ordered.any { it.interrupted },
        contextPlayId = first.contextPlayId,
        contextType = first.contextType,
        contextKey = first.contextKey,
        members = ordered,
        isComplete = endedAt != null && completed && !seeked && first.startPositionSec == 0,
    )
}

fun groupSessionsIntoStretches(sessions: List<Session>): List<ListeningStretch> =
    sessions.groupBy { it.stretchId }
        .values
        .mapNotNull { buildStretch(it) }
        .sortedByDescending { it.startedAt }

fun spansTracks(stretch: ListeningStretch): Boolean = stretch.trackCount > 1

fun describeStretchTracks(stretch: ListeningStretch): String =
    if (stretch.trackCount == 1) "1 track" else "${stretch.trackCount} tracks"

fun describeStretchOutcome(stretch: ListeningStretch): StretchOutcome = when {
    stretch.isComplete -> StretchOutcome.Complete
    stretch.endedAt == null -> StretchOutcome.Open
    stretch.completed -> StretchOutcome.Finished
    else -> StretchOutcome.Interrupted
}

data class ResumeTarget(val trackId: String, val positionSec: Int)

fun stretchResumeTarget(stretch: ListeningStretch): ResumeTarget =
    if (stretch.completed) {
        ResumeTarget(stretch.startTrackId, maxOf(0, stretch.startPositionSec))
    } else {
        ResumeTarget(stretch.endTrackId, maxOf(0, stretch.endPositionSec ?: stretch.startPositionSec))
    }