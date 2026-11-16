package com.pejvak.app.domain

/** Resume-position rules (mirrors mobile/src/lib/resume.ts). Pure. */

/** A position within this many seconds of the end counts as finished. */
const val COMPLETION_EPSILON_SEC: Int = 5

/**
 * Clamps a raw saved position into something worth resuming at. At/past the end
 * (within epsilon) restarts from 0 rather than opening on the final seconds.
 */
fun clampResumePosition(positionSec: Int, durationSec: Int): Int {
    if (positionSec <= 0) return 0
    if (durationSec > 0 && positionSec >= durationSec - COMPLETION_EPSILON_SEC) return 0
    return if (durationSec > 0) minOf(positionSec, durationSec) else positionSec
}

/** Resume position from the latest ended session, clamped. */
fun resumePositionSec(sessions: List<Session>, durationSec: Int): Int {
    val latest = sessions
        .filter { it.endedAt != null && it.endPositionSec != null }
        .maxByOrNull { it.startedAt }
    return clampResumePosition(latest?.endPositionSec ?: 0, durationSec)
}