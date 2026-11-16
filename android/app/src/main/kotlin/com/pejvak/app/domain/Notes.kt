package com.pejvak.app.domain

import com.pejvak.app.core.foldQuery
import com.pejvak.app.core.foldWithMap

/** A note together with the track it belongs to (the Notes screen's row shape). */
data class NoteWithTrack(
    val annotation: Annotation,
    val track: Track,
)

enum class NoteField { Text, Track, Tags, Folder }

data class NoteSearchField(val field: NoteField, val value: String?)

/** What a note can be found by: its words, its track, its tags, its container. */
fun noteSearchFields(note: NoteWithTrack): List<NoteSearchField> = listOf(
    NoteSearchField(NoteField.Text, note.annotation.text),
    NoteSearchField(NoteField.Track, note.track.title),
    NoteSearchField(NoteField.Tags, note.annotation.tags.joinToString(" ")),
    NoteSearchField(NoteField.Folder, note.track.folderName ?: note.track.collectionTitle),
)

/** One search result: the note, highlight ranges in its text, and why it matched. */
data class NoteHit(
    val note: NoteWithTrack,
    /** Ranges into the note's text, for highlighting. Empty when another field won. */
    val ranges: List<IntRange>,
    /** Why this note is a result, when the match was not in its text. */
    val matched: String?,
)

private fun fieldLabel(field: NoteField): String = when (field) {
    NoteField.Text -> "text"
    NoteField.Track -> "track"
    NoteField.Tags -> "tags"
    NoteField.Folder -> "folder"
}

private fun fieldValue(field: NoteField, value: String, note: NoteWithTrack): String =
    if (field == NoteField.Tags) describeNoteTags(note.annotation.tags) ?: value else value

private data class Scored(
    val hit: NoteHit,
    val quality: MatchQuality,
    val position: Int,
    val order: Int,
)

/**
 * Filters notes by a folded query and ranks the hits. Every term must hit the same
 * field (a query narrows); a text hit carries highlight ranges, any other field
 * says why it matched. Ties keep the caller's order.
 */
fun searchNotes(notes: List<NoteWithTrack>, query: String): List<NoteHit> {
    val terms = foldQuery(query)
    if (terms.isEmpty()) return notes.map { NoteHit(it, emptyList(), null) }

    val scored = ArrayList<Scored>(notes.size)
    notes.forEachIndexed { order, note ->
        var best: FoldMatch? = null
        var bestField: NoteField? = null
        for (field in noteSearchFields(note)) {
            val value = field.value
            if (value.isNullOrEmpty()) continue
            val match = matchFolded(foldWithMap(value), terms) ?: continue
            val better = best == null ||
                match.quality.rank > best.quality.rank ||
                (match.quality.rank == best.quality.rank && field.field == NoteField.Text)
            if (better) {
                best = match
                bestField = field.field
            }
        }
        val match = best ?: return@forEachIndexed
        val field = bestField ?: return@forEachIndexed
        val hit = if (field == NoteField.Text) {
            NoteHit(note, match.ranges, null)
        } else {
            val value = noteSearchFields(note).first { it.field == field }.value ?: ""
            NoteHit(note, emptyList(), "${fieldLabel(field)} · ${fieldValue(field, value, note)}")
        }
        scored.add(Scored(hit, match.quality, match.position, order))
    }
    return scored
        .sortedWith(
            compareByDescending<Scored> { it.quality.rank }
                .thenBy { it.position }
                .thenBy { it.order },
        )
        .map { it.hit }
}

fun notesInRange(notes: List<NoteWithTrack>, range: DateRange): List<NoteWithTrack> =
    notes.filter { rangeContains(range, it.annotation.createdAt) }

/** "#history #lecture", or null when the note carries no tags. */
fun describeNoteTags(tags: List<String>): String? {
    val cleaned = tags.map { it.trim() }.filter { it.isNotEmpty() }
    return if (cleaned.isEmpty()) null else cleaned.joinToString(" ") { "#$it" }
}

/**
 * The line that says where the note lives: the track, and its container when the
 * track is inside one. A folder already named like the track is not repeated.
 */
fun describeNoteOrigin(note: NoteWithTrack): String {
    val container = note.track.folderName ?: note.track.collectionTitle
    if (container.isNullOrEmpty() || container == note.track.title) return note.track.title
    return "${note.track.title} · $container"
}
