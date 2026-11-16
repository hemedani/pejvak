package com.pejvak.app.domain

/** The five smart-playlist recipes + dispatcher (see SmartPlaylists.kt for the model). */

private const val CONTINUE_LIMIT = 12
private const val SERIES_PER_FOLDER = 3
private const val SERIES_FOLDER_LIMIT = 4
private const val FORGOTTEN_MIN_PLAYS = 2
private const val FORGOTTEN_MIN_DAYS = 21
private const val FORGOTTEN_LIMIT = 12
private const val REVIEW_LIMIT = 12

private fun buildContinue(context: SmartContext, index: Map<String, TrackHistory>, day: String): List<SmartPick> {
    val picks = ArrayList<SmartPick>()
    for (track in playable(context.tracks)) {
        val entry = index[track.id] ?: continue
        if (entry.finished || entry.resumeSec <= 0) continue
        picks.add(SmartPick(track, (entry.lastPlayedAt ?: 0L).toDouble(), "Left off at ${formatClock(entry.resumeSec)}"))
    }
    return picks.sortedWith(comparator(SmartRuleId.Continue, day)).take(CONTINUE_LIMIT)
}

private data class SeriesRun(val picks: List<SmartPick>, val recency: Long, val folderKey: String)

private fun buildSeries(context: SmartContext, index: Map<String, TrackHistory>, day: String): List<SeriesRun> {
    val byFolder = LinkedHashMap<String, MutableList<Track>>()
    for (track in playable(context.tracks)) {
        val key = track.folderKey ?: continue
        byFolder.getOrPut(key) { ArrayList() }.add(track)
    }
    val runs = ArrayList<SeriesRun>()
    for ((folderKey, folderTracks) in byFolder) {
        if (folderTracks.size < 2) continue
        val ordered = orderFolderTracks(folderTracks)
        val startIndex = ordered.indexOfFirst { !(index[it.id]?.finished ?: false) }
        if (startIndex < 0) continue
        val previous = ordered.getOrNull(startIndex - 1)
        val picks = ArrayList<SmartPick>()
        for (offset in 0 until SERIES_PER_FOLDER) {
            val position = startIndex + offset
            val track = ordered.getOrNull(position) ?: continue
            if (index[track.id]?.finished == true) continue
            val entry = index[track.id]
            val reason = when {
                picks.isEmpty() -> if (previous != null) "Next after \"${previous.title}\"" else "First in ${folderNameFromKey(folderKey)}"
                entry != null && entry.resumeSec > 0 -> "Left off at ${formatClock(entry.resumeSec)}"
                else -> "Step ${position + 1} of ${ordered.size}"
            }
            picks.add(SmartPick(track, (ordered.size - position).toDouble(), reason))
        }
        val recency = folderTracks.maxOfOrNull { index[it.id]?.lastPlayedAt ?: 0L } ?: 0L
        runs.add(SeriesRun(picks, recency, folderKey))
    }
    return runs.sortedWith(
        compareByDescending<SeriesRun> { it.recency }.thenBy { tieBreak(SmartRuleId.Series, day, it.folderKey) },
    )
}

private data class CommuteCandidate(val track: Track, val remainingSec: Int, val resuming: Boolean)

private fun commuteCandidates(context: SmartContext, index: Map<String, TrackHistory>, budgetSec: Int, day: String): List<CommuteCandidate> {
    val candidates = ArrayList<CommuteCandidate>()
    for (track in playable(context.tracks)) {
        if (track.durationSec <= 0) continue
        val entry = index[track.id]
        if (entry?.finished == true) continue
        val resumeSec = entry?.resumeSec ?: 0
        val remainingSec = maxOf(1, track.durationSec - resumeSec)
        if (remainingSec > budgetSec) continue
        candidates.add(CommuteCandidate(track, remainingSec, resumeSec > 0))
    }
    return candidates.sortedWith(
        compareByDescending<CommuteCandidate> { it.resuming }
            .thenByDescending { it.remainingSec }
            .thenBy { tieBreak(SmartRuleId.Commute, day, it.track.id) },
    )
}

private data class RuleResult(val picks: List<SmartPick>, val summary: String, val emptyReason: String?)

private fun runRule(ruleId: SmartRuleId, context: SmartContext, index: Map<String, TrackHistory>, options: SmartPlaylistOptions): RuleResult {
    val day = dayKey(context.now)
    return when (ruleId) {
        SmartRuleId.Continue -> {
            val picks = buildContinue(context, index, day)
            RuleResult(
                picks,
                if (picks.isNotEmpty()) "${plural(picks.size, "track")} waiting where you stopped." else "",
                if (picks.isNotEmpty()) null else "Nothing is part-way through. Start something and it will show up here.",
            )
        }
        SmartRuleId.Series -> {
            val chosen = buildSeries(context, index, day).take(SERIES_FOLDER_LIMIT)
            val picks = chosen.flatMap { it.picks }
            RuleResult(
                picks,
                if (chosen.isNotEmpty()) "${plural(chosen.size, "series", "series")} in progress · next ${plural(picks.size, "step")}." else "",
                if (chosen.isNotEmpty()) null else "No folder is part-way through yet. Play a track inside a folder to start a series.",
            )
        }
        SmartRuleId.Commute -> {
            val budget = options.budgetSec?.takeIf { it > 0 } ?: DEFAULT_COMMUTE_BUDGET_SEC
            val picked = fillToBudget(commuteCandidates(context, index, budget, day), budget) { it.remainingSec }
            val used = picked.sumOf { it.remainingSec }
            val spare = budget - used
            RuleResult(
                picked.map { SmartPick(it.track, it.remainingSec.toDouble(), if (it.resuming) "${formatDuration(it.remainingSec)} left" else formatDuration(it.remainingSec)) },
                if (picked.isNotEmpty()) "${plural(picked.size, "track")} · ${formatDuration(used)} of ${formatDuration(budget)}${if (spare > 60) ", ${formatDuration(spare)} spare" else ""}." else "",
                if (picked.isNotEmpty()) null
                else if (playable(context.tracks).isEmpty()) "Nothing in your library yet."
                else "Nothing fits ${formatDuration(budget)}. Try a longer journey.",
            )
        }
        SmartRuleId.Forgotten -> {
            data class ForgottenRow(val track: Track, val score: Double, val playCount: Int, val lastPlayedAt: Long)
            val scored = ArrayList<ForgottenRow>()
            for (track in playable(context.tracks)) {
                val entry = index[track.id] ?: continue
                val last = entry.lastPlayedAt ?: continue
                if (entry.playCount < FORGOTTEN_MIN_PLAYS) continue
                val days = daysSince(last, context.now)
                if (days < FORGOTTEN_MIN_DAYS) continue
                scored.add(ForgottenRow(track, forgottenScore(entry.playCount, days), entry.playCount, last))
            }
            val picks = scored
                .map { SmartPick(it.track, it.score, "${plural(it.playCount, "play")} · last heard ${describeRecency(it.lastPlayedAt, context.now)}") }
                .sortedWith(comparator(SmartRuleId.Forgotten, day))
                .take(FORGOTTEN_LIMIT)
            RuleResult(
                picks,
                if (picks.isNotEmpty()) "${plural(picks.size, "track")} worth another listen." else "",
                if (picks.isNotEmpty()) null else "Nothing has been played $FORGOTTEN_MIN_PLAYS+ times and then left alone for $FORGOTTEN_MIN_DAYS days.",
            )
        }
        SmartRuleId.Review -> {
            data class ReviewRow(val track: Track, val score: Double, val notes: Int, val lastPlayedAt: Long?)
            val scored = ArrayList<ReviewRow>()
            for (track in playable(context.tracks)) {
                val notes = context.annotationCounts[track.id] ?: 0
                if (notes <= 0) continue
                val last = index[track.id]?.lastPlayedAt
                val days = if (last == null) 0 else daysSince(last, context.now)
                scored.add(ReviewRow(track, reviewScore(notes, days), notes, last))
            }
            val picks = scored
                .map {
                    val reason = if (it.lastPlayedAt == null) plural(it.notes, "note")
                    else "${plural(it.notes, "note")} · last heard ${describeRecency(it.lastPlayedAt, context.now)}"
                    SmartPick(it.track, it.score, reason)
                }
                .sortedWith(comparator(SmartRuleId.Review, day))
                .take(REVIEW_LIMIT)
            RuleResult(
                picks,
                if (picks.isNotEmpty()) "${plural(picks.size, "track")} you took notes on." else "",
                if (picks.isNotEmpty()) null else "No track has notes yet. Add one while listening and it lands here.",
            )
        }
    }
}

private fun assemble(ruleId: SmartRuleId, context: SmartContext, index: Map<String, TrackHistory>, options: SmartPlaylistOptions): SmartPlaylist {
    val result = runRule(ruleId, context, index, options)
    return SmartPlaylist(
        rule = ruleFor(ruleId),
        picks = result.picks,
        summary = result.summary,
        totalDurationSec = result.picks.sumOf { it.track.durationSec },
        emptyReason = result.emptyReason,
    )
}

fun buildSmartPlaylist(ruleId: SmartRuleId, context: SmartContext, options: SmartPlaylistOptions = SmartPlaylistOptions()): SmartPlaylist =
    assemble(ruleId, context, buildTrackHistoryIndex(context.sessions, context.tracks), options)

fun buildSmartPlaylists(ruleIds: List<SmartRuleId>, context: SmartContext, options: SmartPlaylistOptions = SmartPlaylistOptions()): List<SmartPlaylist> {
    val index = buildTrackHistoryIndex(context.sessions, context.tracks)
    return ruleIds.map { assemble(it, context, index, options) }
}