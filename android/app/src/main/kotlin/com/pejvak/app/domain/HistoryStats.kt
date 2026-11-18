package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId

/**
 * Listening statistics derived from the same rows the History list shows, so the
 * two can never disagree (mirrors mobile/src/lib/stats.ts). Finalized sessions
 * only: an in-progress listen has not finished accruing time.
 */
data class ListeningStats(
    val totalListenTimeSec: Int = 0,
    val sessionCount: Int = 0,
    val trackCount: Int = 0,
    val lastPlayedAt: Long? = null,
    val longestSessionSec: Int = 0,
    val longestSessionTitle: String? = null,
    val longestSessionTrackId: String? = null,
    val longestSessionPositionSec: Int = 0,
    val averageSessionSec: Int = 0,
    val activeDayCount: Int = 0,
)

data class TrackLeader(
    val contentHash: String,
    val trackId: String,
    val title: String,
    val listenTimeSec: Int,
    val playCount: Int,
)

data class DailyListen(val key: String, val listenTimeSec: Int)

data class MediaBreakdown(val audiobookSec: Int, val musicSec: Int)

private fun finalized(items: List<HistoryItem>): List<HistoryItem> =
    items.filter { it.session.endedAt != null }

fun computeListeningStats(
    items: List<HistoryItem>,
    zone: ZoneId = ZoneId.systemDefault(),
): ListeningStats {
    val done = finalized(items)
    val hashes = HashSet<String>()
    val days = HashSet<String>()
    var total = 0
    var longest = 0
    var longestTitle: String? = null
    var longestTrackId: String? = null
    var longestPosition = 0
    for (item in done) {
        total += item.session.durationListenedSec
        hashes.add(item.session.contentHash)
        days.add(dayKey(item.session.startedAt, zone))
        if (item.session.durationListenedSec > longest) {
            longest = item.session.durationListenedSec
            longestTitle = item.track.title
            longestTrackId = item.track.id
            longestPosition = resumeTargetSec(item.session)
        }
    }
    val lastPlayedAt = items.maxOfOrNull { it.session.endedAt ?: it.session.startedAt }
    return ListeningStats(
        totalListenTimeSec = total,
        sessionCount = done.size,
        trackCount = hashes.size,
        lastPlayedAt = lastPlayedAt,
        longestSessionSec = longest,
        longestSessionTitle = longestTitle,
        longestSessionTrackId = longestTrackId,
        longestSessionPositionSec = longestPosition,
        averageSessionSec = if (done.isEmpty()) 0 else Math.round(total.toDouble() / done.size).toInt(),
        activeDayCount = days.size,
    )
}

fun computeTrackLeaders(items: List<HistoryItem>, limit: Int = 5): List<TrackLeader> {
    val leaders = LinkedHashMap<String, TrackLeader>()
    for (item in finalized(items)) {
        val key = item.session.contentHash
        val existing = leaders[key]
        leaders[key] = if (existing != null) {
            existing.copy(
                listenTimeSec = existing.listenTimeSec + item.session.durationListenedSec,
                playCount = existing.playCount + 1,
            )
        } else {
            TrackLeader(
                contentHash = key,
                trackId = item.track.id,
                title = item.track.title,
                listenTimeSec = item.session.durationListenedSec,
                playCount = 1,
            )
        }
    }
    return leaders.values
        .sortedWith(compareByDescending<TrackLeader> { it.listenTimeSec }.thenBy { it.title })
        .take(limit)
}

fun computeDailyListen(items: List<HistoryItem>, zone: ZoneId = ZoneId.systemDefault()): List<DailyListen> {
    val buckets = HashMap<String, Int>()
    for (item in finalized(items)) {
        val key = dayKey(item.session.startedAt, zone)
        buckets[key] = (buckets[key] ?: 0) + item.session.durationListenedSec
    }
    return buckets.entries.sortedBy { it.key }.map { DailyListen(it.key, it.value) }
}

/**
 * The last [days] calendar days ending today, zero-filled.
 *
 * [computeDailyListen] returns only the days that were listened to, which is right
 * for a total and wrong for a chart: with one day of history the "Last 14 days"
 * strip collapsed into a single bar as wide as the card. A bar chart needs its
 * empty days.
 */
fun dailyListenWindow(
    items: List<HistoryItem>,
    days: Int = 14,
    zone: ZoneId = ZoneId.systemDefault(),
    now: Long = System.currentTimeMillis(),
): List<DailyListen> {
    if (days <= 0) return emptyList()
    val byDay = computeDailyListen(items, zone).associateBy { it.key }
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return (days - 1 downTo 0).map { back ->
        val date = today.minusDays(back.toLong())
        val key = "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)
        DailyListen(key, byDay[key]?.listenTimeSec ?: 0)
    }
}

fun computeDayStreak(
    items: List<HistoryItem>,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
): Int {
    val active = finalized(items).mapTo(HashSet()) { dayKey(it.session.startedAt, zone) }
    if (active.isEmpty()) return 0
    var cursor = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    if (dayKey(now, zone) !in active) {
        cursor = cursor.minusDays(1)
        if (cursor.toString() !in active) return 0
    }
    var streak = 0
    while (cursor.toString() in active) {
        streak += 1
        cursor = cursor.minusDays(1)
    }
    return streak
}

fun computeBestStreak(items: List<HistoryItem>, zone: ZoneId = ZoneId.systemDefault()): Int {
    val keys = finalized(items).map { dayKey(it.session.startedAt, zone) }.distinct().sorted()
    if (keys.isEmpty()) return 0
    var best = 1
    var run = 1
    for (index in 1 until keys.size) {
        val previous = java.time.LocalDate.parse(keys[index - 1])
        val current = java.time.LocalDate.parse(keys[index])
        run = if (previous.plusDays(1) == current) run + 1 else 1
        if (run > best) best = run
    }
    return best
}

fun sessionsOnDay(items: List<HistoryItem>, key: String, zone: ZoneId = ZoneId.systemDefault()): List<HistoryItem> =
    finalized(items)
        .filter { dayKey(it.session.startedAt, zone) == key }
        .sortedByDescending { it.session.startedAt }

fun computeMediaBreakdown(items: List<HistoryItem>): MediaBreakdown {
    var audiobook = 0
    var music = 0
    for (item in finalized(items)) {
        if (item.track.isAudiobook) audiobook += item.session.durationListenedSec
        else music += item.session.durationListenedSec
    }
    return MediaBreakdown(audiobook, music)
}
