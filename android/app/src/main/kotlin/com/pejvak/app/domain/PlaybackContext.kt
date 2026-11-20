package com.pejvak.app.domain

/** The collection a queue belongs to; the title is captured when playback starts. */
data class PlaybackContext(
    val type: ContextType,
    val key: String,
    val title: String,
    val sort: CollectionSort = CollectionSort.Unknown,
    val direction: SortDirection = SortDirection.Asc,
)

data class ContextStats(
    val playCount: Int = 0,
    val completedPlayCount: Int = 0,
    val listenedSec: Int = 0,
    val lastPlayedAt: Long? = null,
    val bestFinishedCount: Int = 0,
)

data class RunShape(
    val completed: Boolean,
    val finishedCount: Int,
    val trackCount: Int,
)

fun ContextPlay.shape(): RunShape = RunShape(completed, finishedCount, trackCount)

fun sameContext(a: PlaybackContext?, b: PlaybackContext?): Boolean {
    if (a == null || b == null) return a == b
    return a.type == b.type && a.key == b.key
}

fun describeContextType(type: ContextType): String = when (type) {
    ContextType.Folder -> "Folder"
    ContextType.Playlist -> "Playlist"
    ContextType.Online -> "Online"
}

fun runProgressRatio(finishedCount: Int, trackCount: Int): Double =
    if (trackCount <= 0) 0.0 else (finishedCount.toDouble() / trackCount).coerceIn(0.0, 1.0)

fun isPartialRun(run: RunShape): Boolean =
    !run.completed && run.trackCount > 0 && run.finishedCount < run.trackCount

fun formatContextPosition(index: Int, trackCount: Int): String {
    if (trackCount <= 0) return ""
    return "${(index + 1).coerceIn(1, trackCount)} of $trackCount"
}

enum class RunTone { Done, Partial }

data class RunOutcome(val label: String, val tone: RunTone)

fun describeRunOutcome(run: RunShape): RunOutcome = when {
    run.completed -> RunOutcome("Finished", RunTone.Done)
    run.trackCount > 0 && run.finishedCount >= run.trackCount ->
        RunOutcome("All tracks heard", RunTone.Done)
    run.finishedCount > 0 ->
        RunOutcome("Stopped at ${run.finishedCount} of ${run.trackCount}", RunTone.Partial)
    else -> RunOutcome("Left early", RunTone.Partial)
}

fun describeContextStats(stats: ContextStats): String? {
    if (stats.playCount <= 0) return null
    val plays = "${stats.playCount} time${if (stats.playCount == 1) "" else "s"}"
    if (stats.completedPlayCount <= 0) return "Played $plays"
    return "Played $plays, finished ${stats.completedPlayCount}"
}

fun formatPlayCount(playCount: Int): String? = when {
    playCount <= 0 -> null
    playCount == 1 -> "1 play"
    else -> "$playCount plays"
}

fun describeRunScope(run: RunShape): String {
    if (run.trackCount <= 0) return "Empty collection"
    val total = "${run.trackCount} track${if (run.trackCount == 1) "" else "s"}"
    if (run.finishedCount >= run.trackCount) return "All $total finished"
    return "${run.finishedCount} of $total finished"
}

fun runResumeTargetSec(run: ContextPlay): Int =
    if (run.completed) 0 else run.lastPositionSec.coerceAtLeast(0)

fun latestPartialRun(runs: List<ContextPlay>): ContextPlay? =
    runs.firstOrNull { isPartialRun(it.shape()) }
