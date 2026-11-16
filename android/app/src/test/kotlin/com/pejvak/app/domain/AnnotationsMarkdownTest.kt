package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class AnnotationsMarkdownTest {

    private fun track(title: String = "Moby Dick", author: String? = "Melville") = Track(
        id = "t1",
        contentHash = "hash-1",
        title = title,
        author = author,
        createdAt = 0,
        updatedAt = 0,
    )

    private fun note(
        positionSec: Int = 30,
        text: String = "note",
        tags: List<String> = emptyList(),
    ) = Annotation(
        id = "a$positionSec",
        trackId = "t1",
        contentHash = "hash-1",
        positionSec = positionSec,
        text = text,
        tags = tags,
        createdAt = 0,
        updatedAt = 0,
    )

    @Test
    fun rendersTitleAndAuthorHeader() {
        assertEquals(
            "# Moby Dick\n\n_by Melville_\n\n_No annotations yet._",
            annotationsToMarkdown(track(), emptyList()),
        )
    }

    @Test
    fun sortsByPositionAndStampsEachOne() {
        val markdown = annotationsToMarkdown(
            track("Book", null),
            listOf(note(positionSec = 90, text = "later"), note(positionSec = 5, text = "earlier")),
        )
        assertEquals("# Book\n\n- **[0:05]** earlier\n- **[1:30]** later", markdown)
    }

    @Test
    fun appendsTagsAsHashtags() {
        val markdown = annotationsToMarkdown(
            track("Book", null),
            listOf(note(text = "insight", tags = listOf("theme", "quote"))),
        )
        assertEquals("# Book\n\n- **[0:30]** insight #theme #quote", markdown)
    }

    @Test
    fun trimsNoteTextAndFallsBackToUntitled() {
        val markdown = annotationsToMarkdown(
            track("  ", null),
            listOf(note(text = "  spaced  ")),
        )
        assertEquals("# Untitled\n\n- **[0:30]** spaced", markdown)
    }
}
