package com.pejvak.app.domain

/**
 * Sync status copy for the account screen (mirrors mobile's `use-sync-status` and
 * the Settings "Storage & sync" section). Pure so the wording is testable and the
 * screen stays a layout.
 */

/** The server's history meter, returned by `syncLocalData` on every batch. */
data class HistoryQuota(
    val limit: Int,
    val used: Int,
    val remaining: Int,
    val unlimited: Boolean,
)

/** One line naming exactly which tables still hold work. */
fun describePendingQueue(
    tracks: Int,
    sessions: Int,
    annotations: Int,
    playlists: Int,
    contextPlays: Int,
    onlineCollections: Int,
): String {
    val total = tracks + sessions + annotations + playlists + contextPlays + onlineCollections
    if (total == 0) return "Everything on this device is on the server."
    val parts = buildList {
        if (tracks > 0) add("$tracks ${plural(tracks, "track")}")
        if (sessions > 0) add("$sessions ${plural(sessions, "session")}")
        if (annotations > 0) add("$annotations ${plural(annotations, "note")}")
        if (playlists > 0) add("$playlists ${plural(playlists, "playlist")}")
        if (contextPlays > 0) add("$contextPlays ${plural(contextPlays, "collection run")}")
        if (onlineCollections > 0) add("$onlineCollections ${plural(onlineCollections, "online collection")}")
    }
    return parts.joinToString(" · ")
}

/** Relative "last synced" label. A missing timestamp means this device never pushed. */
fun describeLastSync(lastSyncAt: Long?, now: Long): String {
    if (lastSyncAt == null || lastSyncAt <= 0) return "Never synced"
    val delta = (now - lastSyncAt).coerceAtLeast(0)
    return when {
        delta < MINUTE_MS -> "Just now"
        delta < HOUR_MS -> "${delta / MINUTE_MS} min ago"
        delta < DAY_MS -> {
            val hours = delta / HOUR_MS
            "$hours ${plural(hours.toInt(), "hour")} ago"
        }
        else -> {
            val days = delta / DAY_MS
            "$days ${plural(days.toInt(), "day")} ago"
        }
    }
}

/** The history meter sentence, or null when the plan is unlimited / the meter is unknown. */
fun describeHistoryQuota(quota: HistoryQuota?): String? {
    if (quota == null || quota.unlimited) return null
    return "${quota.used} of ${quota.limit} history entries used"
}

private fun plural(count: Int, singular: String): String = if (count == 1) singular else "${singular}s"

private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 3_600_000L
private const val DAY_MS = 86_400_000L
