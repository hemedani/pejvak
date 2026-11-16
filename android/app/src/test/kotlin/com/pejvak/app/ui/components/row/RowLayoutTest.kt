package com.pejvak.app.ui.components.row

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The contract: a row never silently drops a control (DESING.md §9.2). */
class RowLayoutTest {

    private val actions = listOf(
        RowActions.play {},
        RowActions.history {},
        RowActions.add {},
        RowActions.download {},
        RowActions.delete {},
    )

    @Test
    fun noActionIsDropped() {
        val layout = planRowLayout(actions, maxInline = 2)
        assertEquals(actions.size, layout.inline.size + layout.overflow.size)
    }

    @Test
    fun primaryStaysInline() {
        val layout = planRowLayout(actions, maxInline = 2)
        assertTrue(layout.inline.any { it.id == "play" })
    }

    @Test
    fun destructiveGoesToOverflow() {
        val layout = planRowLayout(actions, maxInline = 4)
        assertTrue(layout.overflow.any { it.id == "delete" })
        assertTrue(layout.inline.none { it.menuOnly })
    }

    @Test
    fun primarySurvivesZeroInlineBudget() {
        val layout = planRowLayout(actions, maxInline = 0)
        assertTrue(layout.inline.any { it.id == "play" })
        assertEquals(actions.size, layout.inline.size + layout.overflow.size)
    }

    @Test
    fun inlineRespectsPriorityOrder() {
        val layout = planRowLayout(actions, maxInline = 2)
        assertEquals(listOf("play", "history"), layout.inline.map { it.id })
    }
}