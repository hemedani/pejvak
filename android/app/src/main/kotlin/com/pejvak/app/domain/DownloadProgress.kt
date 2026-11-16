package com.pejvak.app.domain

/**
 * The rules that keep a download's progress from becoming the busiest writer
 * (mirrors mobile/src/lib/downloadProgress.ts). Pure: the caller owns the clock.
 */
const val PROGRESS_WRITE_INTERVAL_MS: Long = 500
const val PROGRESS_WRITE_DELTA_PERCENT: Double = 1.0

data class ProgressSample(val bytesWritten: Long, val totalBytes: Long)

data class ProgressWrite(val sample: ProgressSample, val at: Long)

/** A percentage clamped to 0–100, and 0 when the source never said how big it is. */
fun percentOf(bytesWritten: Long, totalBytes: Long): Double {
    if (totalBytes <= 0) return 0.0
    return ((bytesWritten.toDouble() / totalBytes) * 100.0).coerceIn(0.0, 100.0)
}

/** Whether this progress callback should reach the database. */
fun shouldWriteProgress(previous: ProgressWrite?, next: ProgressSample, now: Long): Boolean {
    if (previous == null) return true
    if (next.totalBytes != previous.sample.totalBytes) return true
    if (now - previous.at >= PROGRESS_WRITE_INTERVAL_MS) return true
    return percentOf(next.bytesWritten, next.totalBytes) -
        percentOf(previous.sample.bytesWritten, previous.sample.totalBytes) >= PROGRESS_WRITE_DELTA_PERCENT
}
