package com.pejvak.app.domain

/**
 * What is broken, and what is at stake (mirrors mobile/src/services/RelinkService.ts
 * pure half). Tracks are referenced in place, so a moved folder leaves rows
 * pointing at nothing — those rows hold the listening history. Grouping by
 * source folder tells the listener which folder to point the scan at. Pure.
 */

data class MissingTrack(
    val track: Track,
    val sessionCount: Int,
    val listenedSec: Int,
    val annotationCount: Int,
)

/** Missing tracks from the same folder — which is what to point the scan at. */
data class MissingGroup(
    val folderKey: String?,
    val folderName: String,
    val tracks: List<MissingTrack>,
)

private const val NO_FOLDER = "No folder"

/**
 * Groups by source folder, ordered by name; tracks with no folder key come last
 * (a folder scan cannot reach them).
 */
fun groupByFolder(missing: List<MissingTrack>): List<MissingGroup> {
    val groups = linkedMapOf<String?, MutableList<MissingTrack>>()
    val names = mutableMapOf<String?, String>()
    for (item in missing) {
        val key = item.track.folderKey
        groups.getOrPut(key) { mutableListOf() }.add(item)
        names.putIfAbsent(key, item.track.folderName ?: (if (key == null) NO_FOLDER else key))
    }
    return groups.map { (key, tracks) -> MissingGroup(key, names.getValue(key), tracks) }
        .sortedWith { left, right ->
            when {
                left.folderKey == null -> if (right.folderKey == null) 0 else 1
                right.folderKey == null -> -1
                else -> naturalCompare(left.folderName, right.folderName)
            }
        }
}

/**
 * What relinking this track saves, or null when nothing is recorded against it —
 * "0 sessions" would only add noise to the row that most needs a clear action.
 */
fun describeStake(sessionCount: Int, listenedSec: Int, annotationCount: Int): String? {
    val parts = mutableListOf<String>()
    if (sessionCount > 0) parts.add("$sessionCount session${if (sessionCount == 1) "" else "s"}")
    if (listenedSec > 0) parts.add("${formatDuration(listenedSec)} listened")
    if (annotationCount > 0) parts.add("$annotationCount note${if (annotationCount == 1) "" else "s"}")
    return parts.joinToString(" · ").ifEmpty { null }
}

/** The headline: how many files, and how much listening they are holding. */
fun summariseMissing(missing: List<MissingTrack>): String {
    if (missing.isEmpty()) return "Every file is where it should be."
    val listenedSec = missing.sumOf { it.listenedSec }
    val files = "${missing.size} file${if (missing.size == 1) "" else "s"} missing"
    return if (listenedSec > 0) "$files · ${formatDuration(listenedSec)} of listening at stake" else files
}