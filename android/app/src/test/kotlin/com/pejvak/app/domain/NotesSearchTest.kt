package com.pejvak.app.domain

import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesSearchTest {

    private val zone = ZoneOffset.UTC
    private val created = LocalDateTime.of(2026, 3, 9, 12, 0).toInstant(zone).toEpochMilli()

    private fun track(
        id: String = "t1",
        title: String = "Chapter 3",
        folderName: String? = null,
        collectionTitle: String? = null,
    ) = Track(
        id = id,
        contentHash = "hash-$id",
        title = title,
        folderName = folderName,
        collectionTitle = collectionTitle,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun annotation(
        id: String = "a1",
        trackId: String = "t1",
        text: String = "The bit about tides",
        tags: List<String> = listOf("history", "lecture"),
        createdAt: Long = created,
    ) = Annotation(
        id = id,
        trackId = trackId,
        contentHash = "hash-$trackId",
        positionSec = 90,
        text = text,
        tags = tags,
        createdAt = createdAt,
        updatedAt = createdAt,
    )

    private fun note(
        annotation: Annotation = annotation(),
        track: Track = track(),
    ) = NoteWithTrack(annotation, track)

    @Test
    fun emptyQueryReturnsEverythingInOrder() {
        val notes = listOf(note(annotation(id = "a1")), note(annotation(id = "a2")))
        assertEquals(listOf("a1", "a2"), searchNotes(notes, "").map { it.note.annotation.id })
        assertTrue(searchNotes(notes, "   ").all { it.ranges.isEmpty() && it.matched == null })
    }

    @Test
    fun textHitCarriesHighlightRanges() {
        val hit = searchNotes(listOf(note()), "tides").single()
        assertEquals(listOf(14 until 19), hit.ranges)
        assertEquals(null, hit.matched)
    }

    @Test
    fun textHitFoldsPersianSpellings() {
        val note = note(annotation(text = "کتاب خوب"))
        val hit = searchNotes(listOf(note), "كتاب").single()
        assertEquals(1, hit.ranges.size)
        assertEquals(0 until 4, hit.ranges.single())
    }

    @Test
    fun trackHitSaysWhyItMatched() {
        val hit = searchNotes(listOf(note()), "chapter").single()
        assertEquals("track · Chapter 3", hit.matched)
        assertTrue(hit.ranges.isEmpty())
    }

    @Test
    fun tagHitSaysWhyItMatched() {
        val hit = searchNotes(listOf(note()), "history lecture").single()
        assertEquals("tags · #history #lecture", hit.matched)
        assertTrue(hit.ranges.isEmpty())
    }

    @Test
    fun folderHitSaysWhyItMatched() {
        val hit = searchNotes(listOf(note(track = track(folderName = "Lectures"))), "lectures").single()
        assertEquals("folder · Lectures", hit.matched)
    }

    @Test
    fun everyTermMustHitTheSameField() {
        // "tides" is in the text, "chapter" in the track; neither field has both.
        assertTrue(searchNotes(listOf(note()), "tides chapter").isEmpty())
    }

    @Test
    fun exactTextBeatsPrefixBeatsSubstring() {
        val notes = listOf(
            note(annotation(id = "substring", text = "the tides of March")),
            note(annotation(id = "prefix", text = "tides of March")),
            note(annotation(id = "exact", text = "tides")),
        )
        assertEquals(
            listOf("exact", "prefix", "substring"),
            searchNotes(notes, "tides").map { it.note.annotation.id },
        )
    }

    @Test
    fun titleWinsATieWithAnotherField() {
        val notes = listOf(
            note(annotation(id = "text", text = "tides"), track = track(title = "Other")),
            note(annotation(id = "track", text = "Something"), track = track(title = "tides")),
        )
        assertEquals(
            listOf("text", "track"),
            searchNotes(notes, "tides").map { it.note.annotation.id },
        )
    }

    @Test
    fun notesInRangeUseCreatedAtInclusively() {
        val early = note(annotation(id = "early", createdAt = created - 86_400_000))
        val late = note(annotation(id = "late", createdAt = created))
        val range = DateRange(created, created)
        assertEquals(listOf("late"), notesInRange(listOf(early, late), range).map { it.annotation.id })
    }

    @Test
    fun noteSearchFieldsIndexTextTrackTagsAndContainer() {
        val fields = noteSearchFields(note(track = track(folderName = "Lectures")))
        assertEquals(
            listOf(
                NoteSearchField(NoteField.Text, "The bit about tides"),
                NoteSearchField(NoteField.Track, "Chapter 3"),
                NoteSearchField(NoteField.Tags, "history lecture"),
                NoteSearchField(NoteField.Folder, "Lectures"),
            ),
            fields,
        )
    }

    @Test
    fun noteSearchFieldsFallBackToTheCollection() {
        val fields = noteSearchFields(note(track = track(collectionTitle = "Oceanography")))
        assertEquals(NoteSearchField(NoteField.Folder, "Oceanography"), fields.last())
    }

    @Test
    fun noteSearchFieldsLeaveAnAbsentContainerNull() {
        assertEquals(null, noteSearchFields(note()).last().value)
    }
}
