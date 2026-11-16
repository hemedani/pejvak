package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TagsTest {

    @Test
    fun emptyDraftIsRejected() {
        val result = addTag(emptyList(), "  ")
        assertFalse(result.added)
        assertEquals(TagRejectReason.Empty, result.reason)
        assertEquals(emptyList<String>(), result.tags)
    }

    @Test
    fun trimsAndCollapsesInternalWhitespace() {
        val result = addTag(emptyList(), "  Persian  history ")
        assertTrue(result.added)
        assertEquals(listOf("Persian history"), result.tags)
    }

    @Test
    fun duplicatesAreFolded() {
        assertFalse(addTag(listOf("کتاب"), "كتاب").added)
        assertEquals(TagRejectReason.Duplicate, addTag(listOf("کتاب"), "كتاب").reason)
        assertEquals(TagRejectReason.Duplicate, addTag(listOf("می\u200Cرود"), "میرود").reason)
        assertEquals(TagRejectReason.Duplicate, addTag(listOf("123"), "۱۲۳").reason)
    }

    @Test
    fun enforcesCountAndLength() {
        val ten = (0 until 10).map { "tag-$it" }
        val limit = addTag(ten, "one more")
        assertFalse(limit.added)
        assertEquals(TagRejectReason.Limit, limit.reason)

        val tooLong = addTag(emptyList(), "x".repeat(25))
        assertFalse(tooLong.added)
        assertEquals(TagRejectReason.TooLong, tooLong.reason)

        assertTrue(addTag(emptyList(), "x".repeat(24)).added)
    }

    @Test
    fun neverMutatesTheInput() {
        val tags = mutableListOf("one")
        addTag(tags, "two")
        assertEquals(listOf("one"), tags)
    }

    @Test
    fun removeTagRemovesOnlyTheIndex() {
        assertEquals(listOf("one", "three"), removeTag(listOf("one", "two", "three"), 1))
    }

    @Test
    fun removeTagLeavesAnUnknownIndexAlone() {
        assertEquals(listOf("one"), removeTag(listOf("one"), 4))
    }

    @Test
    fun normalizeCleansAFreeFormList() {
        assertEquals(
            listOf("one", "two"),
            normalizeTags(listOf("  one ", "", "one", "two", "  ")),
        )
    }
}
