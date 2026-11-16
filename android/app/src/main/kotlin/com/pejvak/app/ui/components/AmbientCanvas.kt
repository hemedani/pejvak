package com.pejvak.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.RampBlue
import com.pejvak.app.ui.theme.RampCyan
import com.pejvak.app.ui.theme.RampTeal

/**
 * The ambient canvas behind every screen (DESING.md §2): a mid-tone base with a
 * few large, soft radial blooms from the content's aurora ramp. Glass needs this
 * colorful field to read as glass. Phase 0 renders it static; Phase 1 adds the
 * slow drift (static under reduced motion) and per-content palette selection.
 */
@Composable
fun AmbientCanvas(modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val bloomAlpha = if (tokens.isDark) 0.22f else 0.20f
    Canvas(modifier = modifier.fillMaxSize()) {
        drawRect(color = tokens.canvasBase)
        val w = size.width
        val h = size.height
        // Mid stops keep the field colorful but deep enough for white text (contract).
        bloom(Offset(w * 0.15f, h * 0.12f), w * 0.75f, RampTeal.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.95f, h * 0.35f), w * 0.70f, RampBlue.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.50f, h * 0.95f), w * 0.85f, RampCyan.second.copy(alpha = bloomAlpha))
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.bloom(
    center: Offset,
    radius: Float,
    color: Color,
) {
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(color, Color.Transparent),
            center = center,
            radius = radius,
        ),
        radius = radius,
        center = center,
    )
}