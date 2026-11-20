package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId

/**
 * History list model (mirrors mobile/src/lib/history.ts). Pure: the caller joins
 * sessions to tracks and supplies a clock. Pagination is by stretch, never by
 * session row, so a multi-track listen can never be cut in half.
 */
data class HistoryItem(
    val session: Session,
    val track: Track,
    val contextTitle: String? = null,
)

data class HistoryStretchEntry(
    val stretch: ListeningStretch,
    val items: List<HistoryItem>,
    val start: HistoryItem,
    val end: HistoryItem,
)

data class HistoryCursor(val startedAt: Long, val stretchId: String)

data class HistorySection<T>(val key: String, val title: String?, val data: List<T>)

fun groupHistoryIntoStretches(items: List<HistoryItem>): List<HistoryStretchEntry> {
    val byId = items.associateBy { it.session.id }
    return groupSessionsIntoStretches(items.map { it.session }).mapNotNull { stretch ->
        val ordered = stretch.members.mapNotNull { byId[it.id] }
        val start = ordered.firstOrNull() ?: return@mapNotNull null
        val end = ordered.last()
        HistoryStretchEntry(stretch, ordered, start, end)
    }
}

fun historyCursorFor(items: List<HistoryItem>): HistoryCursor? {
    val last = items.lastOrNull() ?: return null
    val stretchId = last.session.stretchId
    val startedAt = items.filter { it.session.stretchId == stretchId }
        .maxOfOrNull { it.session.startedAt } ?: last.session.startedAt
    return HistoryCursor(startedAt, stretchId)
}

fun mergeHistoryPages(previous: List<HistoryItem>, next: List<HistoryItem>): List<HistoryItem> {
    if (next.isEmpty()) return previous
    val seen = previous.mapTo(HashSet()) { it.session.id }
    val merged = previous.toMutableList()
    var changed = false
    for (item in next) {
        if (seen.add(item.session.id)) {
            merged.add(item)
            changed = true
        }
    }
    return if (changed) merged else previous
}

fun dayLabel(key: String, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val today = dayKey(now, zone)
    val yesterday = dayKey(now - 86_400_000L, zone)
    if (key == today) return "Today"
    if (key == yesterday) return "Yesterday"
    val date = Instant.parse("${key}T00:00:00Z").atZone(zone)
    val weekday = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")[date.dayOfWeek.value % 7]
    val month = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[date.monthValue - 1]
    return "$weekday, $month ${date.dayOfMonth}"
}

fun <T> groupByDay(
    items: List<T>,
    timestampOf: (T) -> Long,
    now: Long = System.currentTimeMillis(),
    order: HistorySort = HistorySort.Newest,
    zone: ZoneId = ZoneId.systemDefault(),
): List<HistoryDay<T>> {
    val buckets = LinkedHashMap<String, MutableList<T>>()
    for (item in items) {
        buckets.getOrPut(dayKey(timestampOf(item), zone)) { mutableListOf() }.add(item)
    }
    val ascending = order == HistorySort.Oldest
    return buckets.entries
        .sortedBy { it.key }
        .let { if (ascending) it else it.reversed() }
        .map { (key, bucket) ->
            HistoryDay(
                key = key,
                label = dayLabel(key, now, zone),
                items = bucket.sortedBy { timestampOf(it) }.let { if (ascending) it else it.reversed() },
            )
        }
}

data class HistoryDay<T>(val key: String, val label: String, val items: List<T>)

fun buildStretchSections(
    entries: List<HistoryStretchEntry>,
    sort: HistorySort = HistorySort.Newest,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
): List<HistorySection<HistoryStretchEntry>> {
    if (sort == HistorySort.Longest) {
        return listOf(
            HistorySection(
                key = "longest",
                title = null,
                data = entries.sortedWith(
                    compareByDescending<HistoryStretchEntry> { it.stretch.listenedSec }
                        .thenByDescending { it.stretch.startedAt },
                ),
            ),
        )
    }
    return groupByDay(entries, { it.stretch.startedAt }, now, sort, zone)
        .map { HistorySection(it.key, it.label, it.items) }
}

fun resumeTargetSec(session: Session): Int =
    if (session.completed) maxOf(0, session.startPositionSec)
    else maxOf(0, session.endPositionSec ?: session.startPositionSec)

fun stretchResumeTarget(entry: HistoryStretchEntry): Pair<HistoryItem, Int> {
    val target = stretchResumeTarget(entry.stretch)
    val item = entry.items.firstOrNull { it.session.trackId == target.trackId } ?: entry.end
    return item to target.positionSec
}

fun describeStretchTitle(entry: HistoryStretchEntry): String =
    if (entry.stretch.trackCount <= 1) entry.start.track.title
    else "${entry.start.track.title} → ${entry.end.track.title}"

fun formatTimeRange(startedAt: Long, endedAt: Long?, zone: ZoneId = ZoneId.systemDefault()): String {
    fun clock(ts: Long): String {
        val t = Instant.ofEpochMilli(ts).atZone(zone)
        return "%02d:%02d".format(t.hour, t.minute)
    }
    return if (endedAt == null) "${clock(startedAt)} – in progress" else "${clock(startedAt)} – ${clock(endedAt)}"
}

fun formatPositionRange(startSec: Int, endSec: Int?): String =
    if (endSec == null) formatClock(startSec) else "${formatClock(startSec)} – ${formatClock(endSec)}"

fun describeSessionStatus(session: Session): String? = when {
    session.completed -> "Finished"
    session.interrupted -> "Interrupted"
    else -> null
}

fun historySearchFields(item: HistoryItem): List<SearchField> = buildList {
    add(SearchField(LibraryField.Title, item.track.title))
    item.track.author?.let { add(SearchField(LibraryField.Author, it)) }
    item.contextTitle?.let { add(SearchField(LibraryField.Folder, it)) }
}

fun HistoryItem.playbackConditionsForDisplay(): PlaybackConditions {
    val conditions = session.playbackConditions()
    val title = conditions.contextTitle?.takeIf { it.isNotBlank() }
        ?: contextTitle?.takeIf { it.isNotBlank() }
        ?: track.title.takeIf { it.isNotBlank() }
    return conditions.copy(contextTitle = title)
}

/** Snapshot title first, then the live lookup, then the track's own title. */
fun HistoryItem.playbackContextTitle(): String? =
    playbackConditionsForDisplay().contextTitle?.takeIf { it.isNotBlank() }

fun HistoryItem.historySubtitle(): String = playbackContextTitle() ?: track.title

data class PlaybackContextFacts(
    val kind: CollectionKind,
    val title: String?,
    val order: String?,
    val ambience: String?,
    val volume: String,
    val enhancer: String?,
)

fun HistoryItem.playbackContextFacts(): PlaybackContextFacts {
    val conditions = playbackConditionsForDisplay()
    return PlaybackContextFacts(
        kind = collectionKind(),
        title = conditions.contextTitle?.takeIf { it.isNotBlank() },
        order = playbackOrderValue(conditions),
        ambience = playbackAmbienceValue(conditions),
        volume = playbackVolumeValue(conditions),
        enhancer = playbackEnhancerValue(conditions),
    )
}

fun historyMarkdown(entries: List<HistoryStretchEntry>, now: Long = System.currentTimeMillis()): String {
    val lines = mutableListOf("# Listening history")
    val days = groupByDay(entries, { it.stretch.startedAt }, now)
    if (days.isEmpty()) {
        lines.add("")
        lines.add("_No listens recorded yet._")
        return lines.joinToString("\n")
    }
    for (day in days) {
        lines.add("")
        lines.add("## ${day.label}")
        for (entry in day.items) {
            val stretch = entry.stretch
            val outcome = when (describeStretchOutcome(stretch)) {
                StretchOutcome.Complete -> " · Complete"
                StretchOutcome.Finished -> " · Finished"
                StretchOutcome.Interrupted -> " · Interrupted"
                StretchOutcome.Open -> ""
            }
            val tracks = if (stretch.trackCount > 1) " · ${describeStretchTracks(stretch)}" else ""
            val context = playbackMarkdownContext(entry.start.playbackConditionsForDisplay())
            val contextSuffix = if (context.isBlank()) "" else " — $context"
            lines.add(
                "- **${describeStretchTitle(entry)}** — ${formatTimeRange(stretch.startedAt, stretch.endedAt)} · " +
                    "${formatDuration(stretch.listenedSec)} · ${formatSpeed(stretch.playbackSpeed)} · " +
                    formatPositionRange(stretch.startPositionSec, stretch.endPositionSec) + tracks + outcome +
                    contextSuffix,
            )
        }
    }
    return lines.joinToString("\n")
}
