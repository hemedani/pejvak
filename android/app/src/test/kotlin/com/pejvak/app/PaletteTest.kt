package com.pejvak.app

import com.pejvak.app.ui.theme.AuroraRamps
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Phase 0 smoke test: the theme palette is wired and the aurora ramp set is complete. */
class PaletteTest {
    @Test
    fun auroraRamps_areEight() {
        assertEquals(8, AuroraRamps.size)
    }

    @Test
    fun auroraRamps_haveThreeStops() {
        assertTrue(AuroraRamps.all { it.toList().size == 3 })
    }
}