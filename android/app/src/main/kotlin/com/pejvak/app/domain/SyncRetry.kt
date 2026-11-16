package com.pejvak.app.domain

/** Sync retry cadence (mirrors mobile/src/lib/syncRetry.ts). Pure. */

const val BASE_SYNC_INTERVAL_MS: Long = 5 * 60 * 1000
const val MAX_SYNC_INTERVAL_MS: Long = 15 * 60 * 1000

/** Next sync delay: base interval after success, exponential backoff when failing. */
fun retryDelayMs(consecutiveFailures: Int): Long {
    if (consecutiveFailures <= 0) return BASE_SYNC_INTERVAL_MS
    var delay = BASE_SYNC_INTERVAL_MS
    repeat(consecutiveFailures) {
        delay *= 2
        if (delay >= MAX_SYNC_INTERVAL_MS) return MAX_SYNC_INTERVAL_MS
    }
    return minOf(delay, MAX_SYNC_INTERVAL_MS)
}