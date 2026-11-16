package com.pejvak.app.playback

/** Sleep-timer choices offered in the player (minutes). */
val SLEEP_TIMER_MINUTES: List<Int> = listOf(5, 15, 30, 45, 60)

/**
 * Pure sleep-timer deadline logic. The service ticks it once a second; when the
 * deadline passes it fires exactly once (then is spent). No Android imports.
 */
class SleepTimer {
    var deadlineMs: Long? = null
        private set
    private var fired = false

    val isActive: Boolean get() = deadlineMs != null && !fired

    fun start(minutes: Int, nowMs: Long) {
        deadlineMs = nowMs + minutes * 60_000L
        fired = false
    }

    fun cancel() {
        deadlineMs = null
        fired = false
    }

    /** Remaining whole seconds, or null when inactive. */
    fun remainingSec(nowMs: Long): Int? {
        val deadline = deadlineMs ?: return null
        if (fired) return null
        return maxOf(0, ((deadline - nowMs) / 1000).toInt())
    }

    /** True the single tick the deadline is reached; the caller pauses playback. */
    fun shouldPause(nowMs: Long): Boolean {
        val deadline = deadlineMs ?: return false
        if (fired) return false
        if (nowMs >= deadline) {
            fired = true
            return true
        }
        return false
    }
}