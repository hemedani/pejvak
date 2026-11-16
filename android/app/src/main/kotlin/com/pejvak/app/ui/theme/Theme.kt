package com.pejvak.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Resolved glass tokens for the active theme. Screens read these instead of
 * hard-coding colors. Phase 1 expands this with spacing/radius/ramp/type tokens.
 */
data class PejvakTokens(
    val canvasBase: Color,
    val glassFill: Color,
    val glassFillStrong: Color,
    val glassFillFallback: Color,
    val glassBorder: Color,
    val glassHighlight: Color,
    val text: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val accent: Color,
    val onAccent: Color,
    val accentTeal: Color,
    val danger: Color,
    val isDark: Boolean,
)

val LocalPejvakTokens = staticCompositionLocalOf { lightTokens() }

private fun lightTokens() = PejvakTokens(
    canvasBase = CanvasBaseLight,
    glassFill = GlassFillLight,
    glassFillStrong = GlassFillStrongLight,
    glassFillFallback = GlassFillFallbackLight,
    glassBorder = GlassBorderLight,
    glassHighlight = GlassHighlightLight,
    text = TextLight,
    textSecondary = TextSecondaryLight,
    textTertiary = TextTertiaryLight,
    accent = Accent,
    onAccent = OnAccent,
    accentTeal = AccentTealLight,
    danger = DangerLight,
    isDark = false,
)

private fun darkTokens() = PejvakTokens(
    canvasBase = CanvasBaseDark,
    glassFill = GlassFillDark,
    glassFillStrong = GlassFillStrongDark,
    glassFillFallback = GlassFillFallbackDark,
    glassBorder = GlassBorderDark,
    glassHighlight = GlassHighlightDark,
    text = TextDark,
    textSecondary = TextSecondaryDark,
    textTertiary = TextTertiaryDark,
    accent = Accent,
    onAccent = OnAccent,
    accentTeal = AccentTealDark,
    danger = DangerDark,
    isDark = true,
)

@Composable
fun PejvakTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val tokens = if (darkTheme) darkTokens() else lightTokens()
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = tokens.accent,
            onPrimary = tokens.onAccent,
            background = tokens.canvasBase,
            surface = tokens.canvasBase,
            onBackground = tokens.text,
            onSurface = tokens.text,
            error = tokens.danger,
        )
    } else {
        lightColorScheme(
            primary = tokens.accentTeal,
            onPrimary = Color.White,
            background = tokens.canvasBase,
            surface = tokens.canvasBase,
            onBackground = tokens.text,
            onSurface = tokens.text,
            error = tokens.danger,
        )
    }
    CompositionLocalProvider(
        LocalPejvakTokens provides tokens,
        LocalPejvakGeometry provides PejvakGeometry(),
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = PejvakTypography,
            content = content,
        )
    }
}