package com.pejvak.app.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The contrast contract (DESING.md §11). Glass sits over a variable canvas, so we
 * test against the WORST-CASE backdrop: the lightest aurora bloom under the thinnest
 * glass. A palette edit that breaks legibility fails here — never weaken a threshold.
 */
class ContrastContractTest {

    private fun over(fg: Color, bg: Color, alpha: Float): Color = Color(
        red = fg.red * alpha + bg.red * (1 - alpha),
        green = fg.green * alpha + bg.green * (1 - alpha),
        blue = fg.blue * alpha + bg.blue * (1 - alpha),
        alpha = 1f,
    )

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
        val hi = maxOf(la, lb)
        val lo = minOf(la, lb)
        return (hi + 0.05) / (lo + 0.05)
    }

    /** Worst-case glass backdrop: brightest mid-stop bloom over the canvas, then the glass fill. */
    private fun worstGlassBase(canvas: Color, glassFill: Color, bloomAlpha: Float): Color {
        val brightestBloom = AuroraRamps
            .map { over(it.second, canvas, bloomAlpha) }
            .maxBy { luminance(it) }
        return over(glassFill, brightestBloom, glassFill.alpha)
    }

    @Test
    fun lightPrimaryText_clears45() {
        val base = worstGlassBase(CanvasBaseLight, GlassFillLight, 0.20f)
        val ratio = contrast(TextLight, base)
        assertTrue("light text contrast was $ratio", ratio >= 4.5)
    }

    @Test
    fun darkPrimaryText_clears45() {
        val base = worstGlassBase(CanvasBaseDark, GlassFillDark, 0.22f)
        val ratio = contrast(TextDark, base)
        assertTrue("dark text contrast was $ratio", ratio >= 4.5)
    }

    @Test
    fun lightSecondaryText_clears3() {
        val base = worstGlassBase(CanvasBaseLight, GlassFillLight, 0.20f)
        val ratio = contrast(over(TextSecondaryLight, base, TextSecondaryLight.alpha), base)
        assertTrue("light secondary contrast was $ratio", ratio >= 3.0)
    }

    @Test
    fun textTiers_areMeasurablyDifferent() {
        // Composite each tier over the backdrop first — both are white at different
        // alphas, so comparing raw RGB would always read 1.0.
        val lightBase = worstGlassBase(CanvasBaseLight, GlassFillLight, 0.20f)
        val darkBase = worstGlassBase(CanvasBaseDark, GlassFillDark, 0.22f)
        val lightSep = contrast(
            over(TextSecondaryLight, lightBase, TextSecondaryLight.alpha),
            over(TextTertiaryLight, lightBase, TextTertiaryLight.alpha),
        )
        val darkSep = contrast(
            over(TextSecondaryDark, darkBase, TextSecondaryDark.alpha),
            over(TextTertiaryDark, darkBase, TextTertiaryDark.alpha),
        )
        assertTrue("light tier separation was $lightSep", lightSep >= 1.30)
        assertTrue("dark tier separation was $darkSep", darkSep >= 1.30)
    }

    @Test
    fun onAccent_clears45() {
        assertTrue(contrast(OnAccent, Accent) >= 4.5)
    }

    /** Composite a token that already carries its own alpha. */
    private fun blend(fg: Color, bg: Color): Color = over(fg, bg, fg.alpha)

    /** The shell frost stack (base → scrim → sheen) over the worst-case bloom. */
    private fun worstFrost(canvas: Color, base: Color, scrim: Color, sheen: Color, bloomAlpha: Float): Color {
        val brightestBloom = AuroraRamps
            .map { over(it.second, canvas, bloomAlpha) }
            .maxBy { luminance(it) }
        return blend(sheen, blend(scrim, blend(base, brightestBloom)))
    }

    @Test
    fun lightFrostPrimaryText_clears45() {
        val base = worstFrost(CanvasBaseLight, FrostBaseLight, FrostScrimLight, FrostSheenLight, 0.20f)
        val ratio = contrast(TextLight, base)
        assertTrue("light frost text contrast was $ratio", ratio >= 4.5)
    }

    @Test
    fun darkFrostPrimaryText_clears45() {
        val base = worstFrost(CanvasBaseDark, FrostBaseDark, FrostScrimDark, FrostSheenDark, 0.22f)
        val ratio = contrast(TextDark, base)
        assertTrue("dark frost text contrast was $ratio", ratio >= 4.5)
    }

    @Test
    fun lightFrostSecondaryText_clears3() {
        val base = worstFrost(CanvasBaseLight, FrostBaseLight, FrostScrimLight, FrostSheenLight, 0.20f)
        val ratio = contrast(blend(TextSecondaryLight, base), base)
        assertTrue("light frost secondary contrast was $ratio", ratio >= 3.0)
    }

    @Test
    fun darkFrostSecondaryText_clears3() {
        val base = worstFrost(CanvasBaseDark, FrostBaseDark, FrostScrimDark, FrostSheenDark, 0.22f)
        val ratio = contrast(blend(TextSecondaryDark, base), base)
        assertTrue("dark frost secondary contrast was $ratio", ratio >= 3.0)
    }

    /** API 29–30 draws the fallback scrim, never blur: text must still clear. */
    @Test
    fun frostFallback_clears45() {
        val light = blend(FrostFallbackLight, over(AuroraRamps[1].third, CanvasBaseLight, 0.20f))
        val dark = blend(FrostFallbackDark, over(AuroraRamps[1].third, CanvasBaseDark, 0.22f))
        assertTrue("light fallback contrast was ${contrast(TextLight, light)}", contrast(TextLight, light) >= 4.5)
        assertTrue("dark fallback contrast was ${contrast(TextDark, dark)}", contrast(TextDark, dark) >= 4.5)
    }
}