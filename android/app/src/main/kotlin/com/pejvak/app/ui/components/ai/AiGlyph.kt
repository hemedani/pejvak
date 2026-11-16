package com.pejvak.app.ui.components.ai

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.domain.AiFeature
import com.pejvak.app.domain.aiGlyphRamp
import com.pejvak.app.domain.aiGlyphStop
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A tool's mark: its glyph on a tinted disc. The disc uses the deep canvas as its
 * base so the ramp's lightest stop keeps the 3:1 floor on the mark in both schemes
 * (AiContrastTest). Hero tone is the same mark with a wider halo.
 */
@Composable
fun AiGlyph(
    feature: AiFeature,
    size: Dp,
    modifier: Modifier = Modifier,
    hero: Boolean = false,
) {
    val tokens = LocalPejvakTokens.current
    val ramp = AuroraRamps[aiGlyphRamp(feature, tokens.isDark)]
    val tint = ramp.toList()[aiGlyphStop(tokens.isDark)]
    val halo = if (hero) 0.30f else 0.20f
    val brush = Brush.radialGradient(
        colors = listOf(tint.copy(alpha = halo), tokens.canvasBase.copy(alpha = 0.94f)),
    )
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(brush)
            .border(1.dp, tint.copy(alpha = if (hero) 0.42f else 0.32f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        PejvakIcon(
            name = feature.icon,
            contentDescription = null,
            tint = tint,
            size = size * if (hero) 0.46f else 0.50f,
        )
    }
}

/** The soft bloom behind a hero mark; the only loud colour on the page. */
@Composable
fun AiBloom(tint: Color, size: Dp, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    colors = listOf(tint.copy(alpha = 0.24f), tokens.canvasBase.copy(alpha = 0f)),
                ),
            ),
    )
}
