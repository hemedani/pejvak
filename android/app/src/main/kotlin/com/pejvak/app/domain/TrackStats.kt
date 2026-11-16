package com.pejvak.app.domain

/**
 * Per-track listening statistics (mirrors mobile/src/lib/trackStats.ts).
 * computeTrackStats answers "how much"; summariseSessions answers "how" —
 * deliberately a second reading of the same sessions, not more fields. Pure.
 */

data class TrackStats(
    /** Finalized sessions only. */
    val playCount: Int,
    val totalListenTimeSec: Int,
    /** Most recent activity, including an open session's start. */
    val lastPlayedAt: Long?,
    /** Completed / finalized, 0–1. */
    val completionRate: Double,
    val annotationCount: Int,
)

fun computeTrackStats(sessions: List<Session>, annotations: List<Annotation>): TrackStats {
    val finalized = sessions.filter { it.endedAt != null }
    val completedCount = finalized.count { it.completed }
    val lastPlayedAt = sessions.maxOfOrNull { it.endedAt ?: it.startedAt }
    return TrackStats(
        playCount = finalized.size,
        totalListenTimeSec = finalized.sumOf { it.durationListenedSec },
        lastPlayedAt = lastPlayedAt,
        completionRate = if (finalized.isEmpty()) 0.0 else completedCount.toDouble() / finalized.size,
        annotationCount = annotations.size,
    )
}

/** The shape of a track's listening, for the details panel. */
data class SessionSummary(
    val finishedCount: Int,
    val completedCount: Int,
    val interruptedCount: Int,
    /** A session still being written — the track is playing right now. */
    val openCount: Int,
    val totalListenedSec: Int,
    val longestSec: Int,
    /** Mean wall-clock time per finished session. */
    val averageSec: Int,
    val firstStartedAt: Long?,
    val lastActivityAt: Long?,
    /** Distinct calendar days with any listening. */
    val daysListened: Int,
    /** Every playback speed this track has been heard at, ascending. */
    val speeds: List<Double>,
)

fun summariseSessions(sessions: List<Session>): SessionSummary {
    val finished = sessions.filter { it.endedAt != null }
    val totalListenedSec = finished.sumOf { it.durationListenedSec }
    val days = sessions.map { dayKey(it.startedAt) }.toSet()
    val speeds = sessions.map { it.playbackSpeed }.toSortedSet()

    return SessionSummary(
        finishedCount = finished.size,
        completedCount = finished.count { it.completed },
        interruptedCount = finished.count { it.interrupted },
        openCount = sessions.size - finished.size,
        totalListenedSec = totalListenedSec,
        longestSec = sessions.maxOfOrNull { it.durationListenedSec } ?: 0,
        averageSec = if (finished.isEmpty()) 0 else Math.round(totalListenedSec.toDouble() / finished.size).toInt(),
        firstStartedAt = sessions.minOfOrNull { it.startedAt },
        lastActivityAt = sessions.maxOfOrNull { it.endedAt ?: it.startedAt },
        daysListened = days.size,
        speeds = speeds.toList(),
    )
}