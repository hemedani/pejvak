package com.pejvak.app.ui.theme

import androidx.compose.ui.graphics.Color
import com.pejvak.app.domain.AI_FEATURES
import com.pejvak.app.domain.aiGlyphRamp
import com.pejvak.app.domain.aiGlyphStop
import org.junit.Assert.assertTrue
import org.junit.Test

/** AI glyphs are graphical objects: they owe WCAG's 3:1 floor on the canvas. */
class AiContrastTest {

    private fun luminance(c: Color): Double {
        fun lin(v: Float): Double {
            val s = v.toDouble()
            return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(c.red) + 0.7152 * lin(c.green) + 0.0722 * lin(c.blue)
    }

    private fun contrast(a: Color, b: Color): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    @Test
    fun everyToolGlyphClears3OnItsCanvas() {
        for (feature in AI_FEATURES) {
            val tint = AuroraRamps[aiGlyphRamp(feature, dark = false)].toList()[aiGlyphStop(dark = false)]
            val light = contrast(tint, CanvasBaseLight)
            val dark = contrast(tint, CanvasBaseDark)
            assertTrue("${feature.id.wire} light contrast was $light", light >= 3.0)
            assertTrue("${feature.id.wire} dark contrast was $dark", dark >= 3.0)
        }
    }
}
