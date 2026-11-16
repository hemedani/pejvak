package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AiFeaturesTest {

    @Test
    fun `catalogue is the four tools in the promised order`() {
        assertEquals(4, AI_FEATURES.size)
        assertEquals(
            listOf("transcribe", "summarize", "audioSummary", "enhance"),
            AI_FEATURES.map { it.id.wire },
        )
        assertEquals(
            listOf("Transcribe audio", "Summarize text", "Generate audio summary", "Remove noise and enhance audio"),
            AI_FEATURES.map { it.title },
        )
    }

    @Test
    fun `every tool has a distinct icon, ramp and detail sentence`() {
        assertEquals(4, AI_FEATURES.map { it.icon }.toSet().size)
        assertEquals(4, AI_FEATURES.map { it.ramp }.toSet().size)
        for (feature in AI_FEATURES) {
            assertTrue(feature.blurb.isNotBlank())
            assertTrue(feature.detail.length > 40)
            assertTrue(feature.ramp in 0 until 8)
        }
    }

    @Test
    fun `the pinned coming-soon copy is unchanged`() {
        assertEquals("Coming soon.", AI_COMING_SOON_HEADLINE)
        assertEquals(
            "Please help us purchase the server required for our AI features so we can enable these services soon.",
            AI_COMING_SOON_BODY,
        )
    }

    @Test
    fun `unknown ids resolve to nothing and the fallback is honest`() {
        assertNull(aiFeatureFor("waves"))
        assertNull(aiFeatureFor(null))
        assertEquals(AiFeatureId.Transcribe, aiFeatureFor("transcribe")?.id)
        assertEquals("AI tools", AI_FALLBACK_FEATURE.title)
        assertEquals(4, AI_FEATURES.size)
    }

    @Test
    fun `the glyph tint is the readable light stop in both schemes`() {
        for (feature in AI_FEATURES) {
            assertEquals(feature.ramp, aiGlyphRamp(feature, dark = false))
            assertEquals(feature.ramp, aiGlyphRamp(feature, dark = true))
            assertEquals(2, aiGlyphStop(dark = false))
            assertEquals(2, aiGlyphStop(dark = true))
        }
    }
}
