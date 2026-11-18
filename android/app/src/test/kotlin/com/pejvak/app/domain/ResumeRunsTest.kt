package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class ResumeRunsTest {

    private fun run(
        id: String,
        key: String,
        updatedAt: Long,
        completed: Boolean = false,
        deleted: Boolean = false,
        type: ContextType = ContextType.Online,
    ) = ContextPlay(
        id = id,
        contextType = type,
        contextKey = key,
        contextTitle = key,
        startedAt = updatedAt,
        createdAt = updatedAt,
        updatedAt = updatedAt,
        completed = completed,
        deletedAt = if (deleted) updatedAt else null,
    )

    @Test
    fun `a collection played many times yields one run, the newest`() {
        val runs = listOf(
            run("a1", "manahej.190", updatedAt = 100),
            run("a2", "manahej.190", updatedAt = 300),
            run("a3", "manahej.190", updatedAt = 200),
            run("b1", "aminikhaah-podcasts.5656", updatedAt = 250),
        )

        val cards = resumableRuns(runs)

        // The duplicate key is what used to close the app: the cards are keyed by
        // context key, and a Lazy list rejects two equal keys.
        assertEquals(listOf("a2", "b1"), cards.map { it.id })
        assertEquals(cards.size, cards.map { it.contextKey }.distinct().size)
    }

    @Test
    fun `completed and deleted runs are not resumable`() {
        val runs = listOf(
            run("done", "manahej.190", updatedAt = 400, completed = true),
            run("gone", "esra.7", updatedAt = 350, deleted = true),
            run("open", "esra.7", updatedAt = 300),
        )

        assertEquals(listOf("open"), resumableRuns(runs).map { it.id })
    }

    @Test
    fun `only online collections are resumed from discover`() {
        val runs = listOf(
            run("folder", "Music/Test Folder", updatedAt = 500, type = ContextType.Folder),
            run("online", "manahej.190", updatedAt = 400),
        )

        assertEquals(listOf("online"), resumableRuns(runs).map { it.id })
    }

    @Test
    fun `the limit counts collections, not runs`() {
        val runs = (1..6).flatMap { n ->
            listOf(
                run("old$n", "collection.$n", updatedAt = n.toLong()),
                run("new$n", "collection.$n", updatedAt = 100L + n),
            )
        }

        val cards = resumableRuns(runs, limit = 3)

        assertEquals(3, cards.size)
        assertEquals(listOf("new6", "new5", "new4"), cards.map { it.id })
    }
}
