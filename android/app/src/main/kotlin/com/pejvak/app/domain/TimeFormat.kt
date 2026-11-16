package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId

/** Time formatting (mirrors mobile/src/lib/time.ts + history.ts). Pure. */

/** Integer seconds as `m:ss`, or `h:mm:ss` past an hour. */
fun formatClock(totalSec: Int): String {
    val seconds = maxOf(0, totalSec)
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    fun pad(v: Int) = v.toString().padStart(2, '0')
    return if (hours > 0) "$hours:${pad(minutes)}:${pad(secs)}" else "$minutes:${pad(secs)}"
}

/** Coarse duration: `45s`, `12m 30s`, `2h 5m`. */
fun formatDuration(totalSec: Int): String {
    val seconds = maxOf(0, totalSec)
    if (seconds < 60) return "${seconds}s"
    val minutes = seconds / 60
    if (minutes < 60) {
        val rem = seconds % 60
        return if (rem > 0) "${minutes}m ${rem}s" else "${minutes}m"
    }
    val hours = minutes / 60
    val rem = minutes % 60
    return if (rem > 0) "${hours}h ${rem}m" else "${hours}h"
}

/** Local calendar day key `YYYY-MM-DD` (zone injectable for tests). */
fun dayKey(timestampMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val date = Instant.ofEpochMilli(timestampMs).atZone(zone).toLocalDate()
    return "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)
}