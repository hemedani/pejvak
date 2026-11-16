package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** A fact shown in the note sheet, in the order a listener would ask for it. */
data class NoteFact(val label: String, val value: String)

/** A tick on the track's bar: where a note sits, as a fraction of the track. */
data class NoteMarker(
    val id: String,
    /** 0–1 across the bar. */
    val ratio: Float,
    /** This is the note the sheet is open on. */
    val current: Boolean,
)

/**
 * Every note on a track, as ticks. An unknown length yields no markers rather than
 * a bar of guesses; the current note is included among its neighbours.
 */
fun noteMarkers(
    durationSec: Int?,
    notes: List<Annotation>,
    currentId: String,
): List<NoteMarker> {
    if (durationSec == null || durationSec <= 0) return emptyList()
    return notes
        .map { NoteMarker(it.id, markerOffsetRatio(it.positionSec, durationSec), it.id == currentId) }
        .sortedBy { it.ratio }
}

/** The line under the bar: says only what the bar cannot — how many notes share the track. */
fun describeNoteTimeline(markerCount: Int): String =
    if (markerCount <= 1) "The only note on this track"
    else "$markerCount notes on this track"

/**
 * The facts list for a note. Absent facts are left out rather than shown as blanks.
 * The date and the clock are separate rows because they answer separate questions.
 */
fun describeNoteFacts(
    note: NoteWithTrack,
    durationSec: Int?,
    zone: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): List<NoteFact> {
    val annotation = note.annotation
    val track = note.track
    val written = Instant.ofEpochMilli(annotation.createdAt).atZone(zone)
    val dateFormat = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
    val timeFormat = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
    val container = track.folderName ?: track.collectionTitle

    val facts = mutableListOf(
        NoteFact("Date", dateFormat.format(written)),
        NoteFact("Time", timeFormat.format(written).replace('\u202F', ' ').replace('\u00A0', ' ')),
        NoteFact(
            "Position",
            if (durationSec != null && durationSec > 0) {
                "${formatClock(annotation.positionSec)} of ${formatClock(durationSec)}"
            } else {
                formatClock(annotation.positionSec)
            },
        ),
    )
    if (!container.isNullOrEmpty() && container != track.title) {
        facts.add(NoteFact("Collection", container))
    }
    val author = track.author
    if (!author.isNullOrEmpty()) {
        facts.add(NoteFact("Author", author))
    }
    if (annotation.tags.isNotEmpty()) {
        facts.add(NoteFact("Tags", annotation.tags.joinToString(" ") { "#$it" }))
    }
    // "Written on play 1" is every note ever written on a new track.
    if (annotation.timesPlayedBefore > 1) {
        facts.add(NoteFact("Written on", "play ${annotation.timesPlayedBefore}"))
    }
    return facts
}
