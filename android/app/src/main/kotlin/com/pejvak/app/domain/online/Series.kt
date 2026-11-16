package com.pejvak.app.domain.online

import com.pejvak.app.core.foldText

/**
 * The series inside an online collection (mirrors mobile/src/lib/online/series.ts).
 *
 * A category is a shelf, not a course: its playlist interleaves several shows and
 * the only place a series exists is the episode title. This is a *reading* of
 * that title — pure, and pinned by tests against live shapes. A series is never
 * its own identity: the collection still owns saving, downloading and progress.
 */
const val STANDALONE_KEY: String = "\u0000standalone"
const val STANDALONE_TITLE: String = "Standalone episodes"

private const val DIGITS = "0-9\\u0660-\\u0669\\u06F0-\\u06F9"

private val PART_MARKER = Regex(
    "(?:^|[\\s\\-\\u2013\\u2014])(?:قسمت|بخش|پارت|part|episode|ep)\\.?\\s*[$DIGITS]+",
    RegexOption.IGNORE_CASE,
)
private val TRAILING_NUMBER = Regex("[\\s\\-\\u2013\\u2014]+[$DIGITS]+\\s*$")
private val DANGLING = Regex("[\\s\\-\\u2013\\u2014\\u00B7\\u060C:,]+$")
private val SUBTITLE_SEPARATOR = Regex("\\s[\\-\\u2013\\u2014]\\s")

/** The series name an episode title belongs to, in the source's own spelling. */
fun seriesNameOf(title: String): String {
    val cleaned = title.replace(Regex("\\s+"), " ").trim()
    val marker = PART_MARKER.find(cleaned)
    if (marker != null && marker.range.first == 0) return cleaned
    val head = if (marker != null) cleaned.substring(0, marker.range.first) else cleaned
    val trimmed = TRAILING_NUMBER.replace(head, "").let { DANGLING.replace(it, "") }.trim()
    return if (trimmed.isNotEmpty()) trimmed else cleaned
}

private fun lastSubtitleCut(name: String): Int? =
    SUBTITLE_SEPARATOR.findAll(name).lastOrNull()?.range?.first

private fun withSubtitleFolded(name: String, present: Set<String>): String {
    val cut = lastSubtitleCut(name) ?: return name
    val prefix = DANGLING.replace(name.substring(0, cut), "").trim()
    if (prefix.isEmpty()) return name
    return if (foldText(prefix) in present) prefix else name
}

data class SeriesSection<T>(
    /** Folded name — stable only within one call. */
    val key: String,
    /** The series as the source spelled it. */
    val title: String,
    val tracks: List<T>,
    val standalone: Boolean,
)

/**
 * Groups tracks by their series. Sections keep the collection's own order (first
 * episode wins); only groups of two or more become sections, and every one-off
 * falls into a single trailing standalone bucket.
 */
fun <T> buildSeriesSections(tracks: List<T>, titleOf: (T) -> String): List<SeriesSection<T>> {
    if (tracks.isEmpty()) return emptyList()
    val names = tracks.map { seriesNameOf(titleOf(it)) }
    val present = names.map { foldText(it) }.toSet()
    val groups = LinkedHashMap<String, MutableList<T>>()
    val titles = HashMap<String, String>()
    tracks.forEachIndexed { index, track ->
        val name = withSubtitleFolded(names[index], present)
        val key = foldText(name)
        groups.getOrPut(key) { mutableListOf() }.add(track)
        titles.putIfAbsent(key, name)
    }
    val sections = mutableListOf<SeriesSection<T>>()
    val standalone = mutableListOf<T>()
    for ((key, items) in groups) {
        if (items.size > 1) {
            sections.add(SeriesSection(key, titles.getValue(key), items, standalone = false))
        } else {
            standalone.add(items.first())
        }
    }
    if (standalone.isNotEmpty()) {
        sections.add(SeriesSection(STANDALONE_KEY, STANDALONE_TITLE, standalone, standalone = true))
    }
    return sections
}
