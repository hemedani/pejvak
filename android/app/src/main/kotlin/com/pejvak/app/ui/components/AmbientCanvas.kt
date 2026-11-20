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
import com.pejvak.app.ui.theme.RampPurple
import com.pejvak.app.ui.theme.RampTeal

/**
 * The ambient canvas behind every screen (DESING.md §2): a mid-tone base with a
 * few large, soft radial blooms from the content's aurora ramp. Glass needs this
 * colorful field to read as glass — the panes blur it and reflect it, so a rich
 * field is what turns the dock/header from grey film into lit-from-within teal.
 * Phase 0 renders it static; Phase 1 adds the slow drift (static under reduced
 * motion) and per-content palette selection.
 */
@Composable
fun AmbientCanvas(modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    // Dark has the contrast headroom for a rich, colourful field: white text on the
    // deep base still clears 4.5:1 behind the frost even at 0.38 (and where two cool
    // blooms overlap). Light stays deeper so white text on the brighter field clears —
    // both pinned by ContrastContractTest at these alphas.
    val bloomAlpha = if (tokens.isDark) 0.38f else 0.20f
    Canvas(modifier = modifier.fillMaxSize()) {
        drawRect(color = tokens.canvasBase)
        val w = size.width
        val h = size.height
        // Four large soft blooms from the COOL aurora stops (teal / blue / cyan /
        // purple). Cool-only keeps the field dark enough for the contrast contract
        // even under overlap, while staying saturated enough that the blurred glass
        // reads teal/cyan like the reference. Mid stops keep it colorful but deep.
        bloom(Offset(w * 0.12f, h * 0.08f), w * 0.85f, RampTeal.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.98f, h * 0.32f), w * 0.80f, RampBlue.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.42f, h * 0.99f), w * 0.95f, RampCyan.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.92f, h * 0.86f), w * 0.70f, RampPurple.second.copy(alpha = bloomAlpha))
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