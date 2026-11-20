package com.pejvak.app.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the arithmetic stagger and scroll-window safety invariants of [planOceanEntrance]
 * and [oceanSwayFactor].
 */
class MotionEntranceTest {

    @Test
    fun stagger_increasesMonotonicallyAndCaps() {
        assertEquals(0, stagger(0, step = 32, max = 230))
        assertEquals(32, stagger(1, step = 32, max = 230))
        assertEquals(224, stagger(7, step = 32, max = 230))
        assertEquals(230, stagger(8, step = 32, max = 230))
        assertEquals(230, stagger(40, step = 32, max = 230))
    }

    @Test
    fun initialCascade_staggersFirstVisibleItems() {
        val first = planOceanEntrance(
            index = 0,
            staggerEnabled = true,
            elapsedSinceOriginMs = 120L,
            baseDurationMs = 340,
            baseStartScale = 0.978f,
        )
        val fifth = planOceanEntrance(
            index = 5,
            staggerEnabled = true,
            elapsedSinceOriginMs = 120L,
            baseDurationMs = 340,
            baseStartScale = 0.978f,
        )
        assertEquals(0, first.delayMs)
        assertEquals(160, fifth.delayMs)
        assertEquals(0f, fifth.startAlpha, 0.0001f)
        assertEquals(1f, fifth.riseScale, 0.0001f)
        assertEquals(340, fifth.durationMs)
    }

    @Test
    fun scrolledOrLateItems_neverDelayAndStayVisible() {
        val lateScroll = planOceanEntrance(
            index = 2,
            staggerEnabled = true,
            elapsedSinceOriginMs = OCEAN_CASCADE_WINDOW_MS + 100L,
            baseDurationMs = 340,
            baseStartScale = 0.978f,
        )
        val beyondInitialCount = planOceanEntrance(
            index = OCEAN_CASCADE_INITIAL_ITEMS,
            staggerEnabled = true,
            elapsedSinceOriginMs = 0L,
            baseDurationMs = 340,
            baseStartScale = 0.978f,
        )
        val duringSearch = planOceanEntrance(
            index = 3,
            staggerEnabled = false,
            elapsedSinceOriginMs = 0L,
            baseDurationMs = 340,
            baseStartScale = 0.978f,
        )
        listOf(lateScroll, beyondInitialCount, duringSearch).forEach { plan ->
            assertEquals(0, plan.delayMs)
            assertTrue("scroll/filter entrance must remain partially visible", plan.startAlpha >= 0.35f)
            assertTrue("scroll/filter entrance should be concise", plan.durationMs <= 220)
            assertTrue("scroll/filter excursion should be gentler", plan.riseScale < 1f)
        }
    }

    @Test
    fun swayFactor_staysBoundedAndVariesSmoothly() {
        val factors = (0..15).map(::oceanSwayFactor)
        factors.forEach { factor ->
            assertTrue("sway factor $factor out of [-1, 1]", factor in -1f..1f)
        }
        assertEquals(0f, factors[0], 0.0001f)
        assertTrue(
            "sway should include both positive and negative directions",
            factors.any { it > 0.5f } && factors.any { it < -0.5f })
    }
}
