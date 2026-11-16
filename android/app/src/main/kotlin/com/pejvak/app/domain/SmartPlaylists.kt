package com.pejvak.app.domain

import kotlin.math.ln
import kotlin.math.max
import kotlin.math.floor

/**
 * Smart playlists — lists the listener did not have to build (mirrors
 * mobile/src/lib/smartPlaylists.ts). Each recipe: filter → score → sequence →
 * explain. Every pick carries a reason. Nothing is persisted; a smart playlist is a
 * view over the library. All pure — the caller supplies tracks, live sessions, a clock.
 */
enum class SmartRuleId(val wire: String) {
    Continue("continue"), Series("series"), Commute("commute"), Forgotten("forgotten"), Review("review");
    companion object { fun from(wire: String?): SmartRuleId? = entries.firstOrNull { it.wire == wire } }
}

data class SmartRule(val id: SmartRuleId, val title: String, val tagline: String)

val SMART_RULES: List<SmartRule> = listOf(
    SmartRule(SmartRuleId.Continue, "Pick up", "Everything you stopped part-way through"),
    SmartRule(SmartRuleId.Series, "Next in series", "The next lectures from the folders you are working through"),
    SmartRule(SmartRuleId.Commute, "Fits your commute", "Filled to a time budget you choose"),
    SmartRule(SmartRuleId.Forgotten, "Forgotten favourites", "Tracks you loved and have not touched in a while"),
    SmartRule(SmartRuleId.Review, "Review your notes", "Tracks you annotated, stalest first"),
)

val COMMUTE_BUDGETS_SEC: List<Int> = listOf(900, 1800, 2700, 3600)
const val DEFAULT_COMMUTE_BUDGET_SEC: Int = 1800

fun ruleFor(id: SmartRuleId): SmartRule = SMART_RULES.first { it.id == id }

data class TrackHistory(
    val finished: Boolean = false,
    val resumeSec: Int = 0,
    val playCount: Int = 0,
    val totalListenTimeSec: Int = 0,
    val lastPlayedAt: Long? = null,
    val firstPlayedAt: Long? = null,
)

data class SmartContext(
    val tracks: List<Track>,
    val sessions: List<Session>,
    val annotationCounts: Map<String, Int>,
    val now: Long,
)

data class SmartPick(val track: Track, val score: Double, val reason: String)

data class SmartPlaylist(
    val rule: SmartRule,
    val picks: List<SmartPick>,
    val summary: String,
    val totalDurationSec: Int,
    val emptyReason: String?,
)

data class SmartPlaylistOptions(val budgetSec: Int? = null)

private const val DAY_MS = 86_400_000L

/** One pass over sessions, then resume candidates. Finished and resume come from different sessions. */
fun buildTrackHistoryIndex(sessions: List<Session>, tracks: List<Track>): Map<String, TrackHistory> {
    val index = HashMap<String, TrackHistory>()
    for (session in sessions) {
        val entry = index.getOrPut(session.trackId) { TrackHistory() }
        val at = session.endedAt ?: session.startedAt
        index[session.trackId] = entry.copy(
            lastPlayedAt = if (entry.lastPlayedAt == null || at > entry.lastPlayedAt) at else entry.lastPlayedAt,
            firstPlayedAt = if (entry.firstPlayedAt == null || session.startedAt < entry.firstPlayedAt) session.startedAt else entry.firstPlayedAt,
            playCount = if (session.endedAt != null) entry.playCount + 1 else entry.playCount,
            totalListenTimeSec = if (session.endedAt != null) entry.totalListenTimeSec + session.durationListenedSec else entry.totalListenTimeSec,
            finished = entry.finished || (session.endedAt != null && session.completed),
        )
    }
    val durationById = tracks.associate { it.id to it.durationSec }
    val latestEnd = HashMap<String, Pair<Long, Int>>()
    for (session in sessions) {
        val end = session.endPositionSec ?: continue
        if (session.endedAt == null) continue
        val current = latestEnd[session.trackId]
        if (current == null || session.startedAt >= current.first) {
            latestEnd[session.trackId] = session.startedAt to end
        }
    }
    for ((trackId, latest) in latestEnd) {
        val entry = index[trackId] ?: continue
        index[trackId] = entry.copy(resumeSec = clampResumePosition(latest.second, durationById[trackId] ?: 0))
    }
    return index
}

fun daysSince(timestampMs: Long, now: Long): Int = max(0, floor((now - timestampMs).toDouble() / DAY_MS).toInt())

fun describeRecency(timestampMs: Long, now: Long): String {
    val days = daysSince(timestampMs, now)
    return when {
        days <= 0 -> "today"
        days == 1 -> "yesterday"
        days < 7 -> "$days days ago"
        days < 14 -> "last week"
        else -> {
            val weeks = days / 7
            if (weeks < 5) "$weeks weeks ago"
            else {
                val months = days / 30
                if (months <= 1) "last month"
                else if (months < 12) "$months months ago"
                else {
                    val years = days / 365
                    if (years <= 1) "a year ago" else "$years years ago"
                }
            }
        }
    }
}

internal fun tieBreak(ruleId: SmartRuleId, day: String, trackId: String): Long =
    hashString("${ruleId.wire}:$day:$trackId")

internal fun comparator(ruleId: SmartRuleId, day: String): Comparator<SmartPick> =
    compareByDescending<SmartPick> { it.score }.thenBy { tieBreak(ruleId, day, it.track.id) }

internal fun playable(tracks: List<Track>): List<Track> = tracks.filter { it.availability != Availability.Missing }

internal fun plural(count: Int, singular: String, pluralForm: String? = null): String =
    "$count ${if (count == 1) singular else (pluralForm ?: "${singular}s")}"

/** Fondness weighted by absence: plays × log2(2 + days). */
fun forgottenScore(playCount: Int, days: Int): Double = playCount * (ln(2.0 + max(0, days)) / ln(2.0))

fun reviewScore(annotationCount: Int, days: Int): Double = annotationCount * (ln(2.0 + max(0, days)) / ln(2.0))

/** First-fit into a single time budget (longest first offered by the caller). */
fun <T> fillToBudget(candidates: List<T>, budgetSec: Int, remainingOf: (T) -> Int): List<T> {
    val picked = ArrayList<T>()
    var used = 0
    for (candidate in candidates) {
        val remaining = remainingOf(candidate)
        if (remaining > budgetSec - used) continue
        picked.add(candidate)
        used += remaining
    }
    return picked
}