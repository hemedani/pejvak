package com.pejvak.app.domain

/** The fields folder playback reasons about — a structural subset of [Track]. */
data class FolderPlayableTrack(
    val id: String,
    val fileName: String?,
    val title: String,
    val durationSec: Int,
    val discNumber: Int?,
    val trackNumber: Int?,
    val availability: Availability,
)

fun Track.toFolderPlayable(): FolderPlayableTrack = FolderPlayableTrack(
    id = id,
    fileName = fileName,
    title = title,
    durationSec = durationSec,
    discNumber = discNumber,
    trackNumber = trackNumber,
    availability = availability,
)

data class FolderTrackProgress(val finished: Boolean, val resumeSec: Int)

val UNPLAYED_PROGRESS = FolderTrackProgress(false, 0)

enum class FolderPlayMode { Resume, Restart, Unfinished, Shuffle }

data class FolderPlayOptions(
    val mode: FolderPlayMode = FolderPlayMode.Resume,
    val random: () -> Double = { Math.random() },
)

data class FolderPlayPlan(
    val tracks: List<FolderPlayableTrack>,
    val queueIds: List<String>,
    val startIndex: Int,
    val startPositionSec: Int,
    val missingCount: Int,
)

/** Fisher–Yates on a copy; the min guards a source that returns exactly 1. */
fun <T> shuffleTracks(tracks: List<T>, random: () -> Double = { Math.random() }): List<T> {
    val result = tracks.toMutableList()
    for (index in result.lastIndex downTo 1) {
        val swapWith = minOf(index, (random() * (index + 1)).toInt())
        val value = result[index]
        result[index] = result[swapWith]
        result[swapWith] = value
    }
    return result
}

fun buildFolderPlan(
    tracks: List<FolderPlayableTrack>,
    progress: Map<String, FolderTrackProgress>,
    options: FolderPlayOptions = FolderPlayOptions(),
): FolderPlayPlan {
    val missingCount = tracks.count { it.availability == Availability.Missing }
    val ordered = orderByFolder(
        tracks.filter { it.availability != Availability.Missing },
        trackNumber = { it.trackNumber },
        discNumber = { it.discNumber },
        fileName = { it.fileName },
        title = { it.title },
    )
    fun plan(items: List<FolderPlayableTrack>, index: Int, position: Int) =
        FolderPlayPlan(items, items.map { it.id }, index, position, missingCount)

    if (ordered.isEmpty()) return plan(emptyList(), 0, 0)
    if (options.mode == FolderPlayMode.Shuffle) {
        return plan(shuffleTracks(ordered, options.random), 0, 0)
    }
    if (options.mode == FolderPlayMode.Unfinished) {
        val remaining = ordered.filter { progress[it.id]?.finished != true }
        if (remaining.isNotEmpty()) {
            return plan(remaining, 0, progress[remaining[0].id]?.resumeSec ?: 0)
        }
    }
    if (options.mode == FolderPlayMode.Restart) return plan(ordered, 0, 0)

    val startIndex = pickFolderStartIndex(ordered.map { progress[it.id]?.finished == true })
    return plan(ordered, startIndex, progress[ordered[startIndex].id]?.resumeSec ?: 0)
}

fun folderProgressRatio(finishedCount: Int, trackCount: Int): Double =
    if (trackCount <= 0) 0.0 else (finishedCount.toDouble() / trackCount).coerceIn(0.0, 1.0)

fun describeFolderProgress(finishedCount: Int, trackCount: Int): String {
    if (trackCount <= 0) return "Empty folder"
    val tracks = "$trackCount track${if (trackCount == 1) "" else "s"}"
    if (finishedCount <= 0) return tracks
    if (finishedCount >= trackCount) return "All $tracks finished"
    return "$finishedCount of $trackCount finished"
}

fun describeMissing(missingCount: Int): String? = when {
    missingCount <= 0 -> null
    missingCount == 1 -> "1 file missing"
    else -> "$missingCount files missing"
}

data class FolderTrackState(val kind: String, val label: String)

fun describeFolderTrackStatus(
    progress: FolderTrackProgress?,
    track: FolderPlayableTrack,
): FolderTrackState = when {
    track.availability == Availability.Missing -> FolderTrackState("missing", "File missing")
    progress?.finished == true -> FolderTrackState("finished", "Finished")
    progress != null && progress.resumeSec > 0 ->
        FolderTrackState("continued", "Resume at ${formatClock(progress.resumeSec)}")
    else -> FolderTrackState("info", "Not started")
}
