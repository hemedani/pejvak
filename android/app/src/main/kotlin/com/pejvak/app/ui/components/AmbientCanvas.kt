package com.pejvak.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.RampBlue
import com.pejvak.app.ui.theme.RampCyan
import com.pejvak.app.ui.theme.RampPurple
import com.pejvak.app.ui.theme.RampTeal
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlin.math.PI
import kotlin.math.sin

/**
 * The ambient canvas behind every screen (DESING.md §2): a mid-tone base with a
 * few large, soft radial blooms from the content's aurora ramp. Glass needs this
 * colorful field to read as glass — the panes blur it and reflect it, so a rich
 * field is what turns the dock/header from grey film into lit-from-within teal.
 *
 * When [navTrigger] increments (and [useMotionEnabled] is true), the blooms surge
 * gently along the navigation current before settling back to rest, so glass panes
 * catch a passing ocean swell with zero idle animation cost.
 */
@Composable
fun AmbientCanvas(
    modifier: Modifier = Modifier,
    navTrigger: Int = 0,
    navShiftX: Float = 0f,
    navShiftY: Float = 0f,
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val surge = remember { Animatable(0f) }
    LaunchedEffect(navTrigger, motion) {
        if (navTrigger <= 0 || !motion) {
            surge.snapTo(0f)
            return@LaunchedEffect
        }
        surge.snapTo(0f)
        surge.animateTo(1f, tween(760, easing = LinearEasing))
    }
    // Dark has the contrast headroom for a rich, colourful field: white text on the
    // deep base still clears 4.5:1 behind the frost even at 0.38 (and where two cool
    // blooms overlap). Light stays deeper so white text on the brighter field clears —
    // both pinned by ContrastContractTest at these alphas.
    val baseBloomAlpha = if (tokens.isDark) 0.38f else 0.20f
    Canvas(modifier = modifier.fillMaxSize()) {
        drawRect(color = tokens.canvasBase)
        val w = size.width
        val h = size.height
        val s = surge.value
        val arc = if (s > 0f && s < 1f) sin(s * PI).toFloat() else 0f
        val dx = navShiftX * arc * w * 0.06f
        val dy = navShiftY * arc * h * 0.055f
        val bloomAlpha = baseBloomAlpha + (if (tokens.isDark) 0.05f else 0.025f) * arc
        // Four large soft blooms from the COOL aurora stops (teal / blue / cyan /
        // purple). Cool-only keeps the field dark enough for the contrast contract
        // even under overlap, while staying saturated enough that the blurred glass
        // reads teal/cyan like the reference. Mid stops keep it colorful but deep.
        bloom(Offset(w * 0.12f + dx, h * 0.08f + dy), w * 0.85f, RampTeal.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.98f - dx * 0.7f, h * 0.32f + dy * 0.8f), w * 0.80f, RampBlue.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.42f + dx * 0.9f, h * 0.99f - dy * 0.6f), w * 0.95f, RampCyan.second.copy(alpha = bloomAlpha))
        bloom(Offset(w * 0.92f - dx * 0.5f, h * 0.86f - dy), w * 0.70f, RampPurple.second.copy(alpha = bloomAlpha))
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
