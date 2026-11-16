package com.pejvak.app.domain

import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteDetailTest {

    private val zone = ZoneOffset.UTC
    private val locale = Locale.US
    private val created = LocalDateTime.of(2026, 3, 9, 14, 5).toInstant(zone).toEpochMilli()

    private fun track(
        title: String = "Chapter 3",
        author: String? = "Ada",
        folderName: String? = null,
        collectionTitle: String? = null,
    ) = Track(
        id = "t1",
        contentHash = "hash-1",
        title = title,
        author = author,
        folderName = folderName,
        collectionTitle = collectionTitle,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun note(
        annotation: Annotation = annotation(),
        track: Track = track(),
    ) = NoteWithTrack(annotation, track)

    private fun annotation(
        id: String = "a1",
        positionSec: Int = 90,
        text: String = "The bit about tides",
        tags: List<String> = emptyList(),
        color: String? = null,
        timesPlayedBefore: Int = 0,
    ) = Annotation(
        id = id,
        trackId = "t1",
        contentHash = "hash-1",
        positionSec = positionSec,
        text = text,
        tags = tags,
        color = color,
        timesPlayedBefore = timesPlayedBefore,
        createdAt = created,
        updatedAt = created,
    )

    @Test
    fun markersPlaceEveryNoteInOrder() {
        val siblings = listOf(
            annotation(id = "a1", positionSec = 90),
            annotation(id = "a2", positionSec = 30),
            annotation(id = "a3", positionSec = 300),
        )
        assertEquals(
            listOf(0.05f, 0.15f, 0.5f),
            noteMarkers(600, siblings, "a1").map { it.ratio },
        )
    }

    @Test
    fun exactlyOneMarkerIsCurrent() {
        val siblings = listOf(
            annotation(id = "a1", positionSec = 90),
            annotation(id = "a2", positionSec = 30),
        )
        assertEquals(listOf("a2"), noteMarkers(600, siblings, "a2").filter { it.current }.map { it.id })
    }

    @Test
    fun markersIncludeTheOpenNoteAmongItsNeighbours() {
        val siblings = listOf(
            annotation(id = "a1", positionSec = 90),
            annotation(id = "a2", positionSec = 30),
            annotation(id = "a3", positionSec = 300),
        )
        assertEquals(siblings.size, noteMarkers(600, siblings, "a1").size)
    }

    @Test
    fun unknownDurationDrawsNoMarkers() {
        val siblings = listOf(annotation())
        assertTrue(noteMarkers(null, siblings, "a1").isEmpty())
        assertTrue(noteMarkers(0, siblings, "a1").isEmpty())
    }

    @Test
    fun markerPastTheEndIsClamped() {
        val markers = noteMarkers(100, listOf(annotation(positionSec = 400)), "a1")
        assertEquals(1f, markers.single().ratio, 0.0001f)
    }

    @Test
    fun timelineSaysHowManyNotesShareTheTrack() {
        assertEquals("3 notes on this track", describeNoteTimeline(3))
        assertEquals("The only note on this track", describeNoteTimeline(1))
        assertEquals("The only note on this track", describeNoteTimeline(0))
    }

    @Test
    fun factsLeadWithWhenAndWhere() {
        val facts = describeNoteFacts(note(), 600, zone, locale)
        assertEquals(
            listOf(
                NoteFact("Date", "Mar 9, 2026"),
                NoteFact("Time", "2:05 PM"),
                NoteFact("Position", "1:30 of 10:00"),
            ),
            facts.take(3),
        )
    }

    @Test
    fun positionAloneWhenTheTrackLengthIsUnknown() {
        val facts = describeNoteFacts(note(), null, zone, locale)
        assertEquals("1:30", facts.first { it.label == "Position" }.value)
    }

    @Test
    fun absentFactsAreLeftOut() {
        val labels = describeNoteFacts(
            note(annotation(timesPlayedBefore = 1), track(author = null)),
            null,
            zone,
            locale,
        ).map { it.label }
        assertEquals(listOf("Date", "Time", "Position"), labels)
    }

    @Test
    fun namesTheContainerOnlyWhenItIsNotTheTrackName() {
        val folder = describeNoteFacts(note(track = track(folderName = "Lectures")), null, zone, locale)
        assertEquals("Lectures", folder.first { it.label == "Collection" }.value)

        val repeated = describeNoteFacts(note(track = track(folderName = "Chapter 3")), null, zone, locale)
        assertFalse(repeated.any { it.label == "Collection" })
    }

    @Test
    fun writesTagsBackTheWayTheRowDoes() {
        val facts = describeNoteFacts(
            note(annotation(tags = listOf("history", "lecture"))),
            null,
            zone,
            locale,
        )
        assertEquals("#history #lecture", facts.first { it.label == "Tags" }.value)
    }

    @Test
    fun mentionsThePlayCountOnlyAfterTheFirstListen() {
        val first = describeNoteFacts(note(annotation(timesPlayedBefore = 1)), null, zone, locale)
        assertFalse(first.any { it.label == "Written on" })

        val fourth = describeNoteFacts(note(annotation(timesPlayedBefore = 4)), null, zone, locale)
        assertEquals("play 4", fourth.first { it.label == "Written on" }.value)
    }

    @Test
    fun noteTagsAreHashedAndEmptyOnesDropped() {
        assertEquals("#history #lecture", describeNoteTags(listOf("history", "lecture")))
        assertEquals("#history", describeNoteTags(listOf("  ", "history", "")))
        assertNull(describeNoteTags(emptyList()))
        assertNull(describeNoteTags(listOf("   ")))
    }

    @Test
    fun originNamesTheTrackAndItsFolder() {
        assertEquals("Chapter 3", describeNoteOrigin(note()))
        assertEquals("Chapter 3 · Lectures", describeNoteOrigin(note(track = track(folderName = "Lectures"))))
        assertEquals(
            "Chapter 3 · Lectures",
            describeNoteOrigin(note(track = track(folderName = "Lectures", collectionTitle = "Ocean"))),
        )
        assertEquals("Chapter 3", describeNoteOrigin(note(track = track(folderName = "Chapter 3"))))
    }
}
