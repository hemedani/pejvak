package com.pejvak.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The wave language, in one place.
 *
 * The scrubber, the sliders and the page transitions all draw the same sine so the
 * app reads as one body of water rather than three unrelated animations. Everything
 * here is pure and cheap: [waveOffsetAt] is the single evaluation of the curve, so
 * anything that needs to sit *on* the wave (a playhead, a thumb) can ask for the same
 * number the path was built from and cannot drift out of step.
 */

/** A crest-to-crest span long enough to read as water rather than as a saw. */
const val WAVE_WAVELENGTH_DP = 64f

/** The wave's vertical offset at [x], excluding any taper. */
fun waveOffsetAt(
    x: Float,
    amplitude: Float,
    wavelength: Float,
    phase: Float,
    variation: Float,
): Float {
    if (wavelength <= 0f || amplitude == 0f) return 0f
    val k = (2f * PI / wavelength).toFloat()
    val breatheK = (2f * PI / (wavelength * 5f)).toFloat()
    val breathe = 1f + variation * sin(x * breatheK + phase * 0.6f)
    return sin(x * k + phase) * amplitude * breathe
}

/**
 * A sine along `y = cy` between [from] and [to].
 *
 * The wavelength is absolute, never a fraction of the drawn width: tying the
 * frequency to the filled part of a bar makes the first seconds a tight scribble and
 * the last stretch a near-straight line. [variation] gently modulates the height along
 * x so no two crests are identical, and [taper] fades both ends into the baseline so
 * the stroke never starts or stops with a vertical jump.
 */
fun wavePath(
    from: Float,
    to: Float,
    cy: Float,
    amplitude: Float,
    wavelength: Float,
    phase: Float,
    taper: Float,
    variation: Float,
    taperEnd: Float = taper,
): Path {
    val path = Path()
    val span = to - from
    if (span <= 0f) return path
    if (amplitude <= 0f || wavelength <= 0f) {
        path.moveTo(from, cy)
        path.lineTo(to, cy)
        return path
    }
    val steps = max(2, (span / (wavelength / 24f)).roundToInt())
    val edgeStart = min(taper, span / 2f)
    val edgeEnd = min(taperEnd, span / 2f)
    for (i in 0..steps) {
        val x = from + span * (i / steps.toFloat())
        val fade = ramp(x - from, edgeStart) * ramp(to - x, edgeEnd)
        val y = cy + fade * waveOffsetAt(x, amplitude, wavelength, phase, variation)
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    return path
}

/** Smooth 0→1 over [edge]: the wave grows out of the baseline instead of jumping. */
fun ramp(distance: Float, edge: Float): Float {
    if (edge <= 0f) return 1f
    val t = (distance / edge).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

/**
 * The drift. Always called (never conditionally) so the composition structure stays
 * stable; callers that only want motion on demand pass `0f` to the drawing instead.
 */
@Composable
fun rememberWavePhase(periodMillis: Int = 3_800): Float {
    val transition = rememberInfiniteTransition(label = "wave")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 2f * PI.toFloat(),
        animationSpec = infiniteRepeatable(tween(periodMillis, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    return phase
}

/**
 * One strand of the wake — the fish's ripple running back from the head.
 *
 * The strand carries its own phase offset as well as a vertical offset, and *both*
 * decay with distance. That combination is the whole
 * trick: with only an offset the strands run parallel to the centre wave and read as
 * a grey shadow of it, but with a phase offset they are genuinely different waves at
 * the playhead — two flanking ripples and the one in the middle — and as the phase
 * unwinds they lock back into step and merge into that middle wave.
 *
 * Three decays, on three schedules:
 * - **Opacity** falls slowly (`near^0.8`), so the strands stay legible into the tail and
 *   the merge at the end is soft rather than a visible junction.
 * - **Dash length** collapses (`near^2.2`, ~9 dp → 0.6 dp) while the gaps widen, so
 *   a continuous ripple near the playhead turns into a dotted trail behind it.
 * - **Offset and phase** hold their width through most of the wake (an ease-out
 *   `1-(1-near)^2`) and only close near the tail, so the fan reads as ripples running
 *   out of energy rather than as a bracket drawn around the playhead.
 */
internal fun DrawScope.drawWaveWake(
    headX: Float,
    cy: Float,
    spread: Float,
    phaseShift: Float,
    amplitude: Float,
    phase: Float,
    color: Color,
    scale: Float,
    lengthDp: Float,
    wavelength: Float,
    alphaBase: Float,
    amplitudeScale: Float = 0.35f,
    direction: Float = 1f,
    cyAt: ((Float) -> Float)? = null,
) {
    val dir = if (direction >= 0f) 1f else -1f
    val available = if (dir > 0f) headX else (size.width - headX)
    val length = min(lengthDp * scale, available.coerceAtLeast(0f))
    if (length <= 1f) return
    val k = (2f * PI / wavelength).toFloat()
    val dashLong = 9.dp.toPx() * scale
    val dashShort = 0.6.dp.toPx() * scale
    val gapTight = 2.6.dp.toPx() * scale
    val gapWide = 6.5.dp.toPx() * scale
    val offsetMax = spread
    val thin = 1.dp.toPx() * scale
    val thick = 1.5.dp.toPx() * scale

    var travelled = 0f
    while (travelled < length) {
        val near = 1f - (travelled / length).coerceIn(0f, 1f)
        val alpha = alphaBase * near.pow(0.8f)
        if (alpha < 0.035f) break
        val dotted = near * near
        val dash = dashShort + (dashLong - dashShort) * near.pow(2.2f)
        val gap = gapWide - (gapWide - gapTight) * dotted
        val x0 = headX - dir * travelled
        val x1 = (x0 - dir * dash).coerceIn(0f, size.width)
        if ((dir > 0f && x1 >= x0) || (dir < 0f && x1 <= x0)) break
        // The fan holds its width for most of the wake and closes near the tail, so it
        // reads as ripples running out of energy rather than as a bracket drawn round
        // the playhead.
        val close = 1f - (1f - near) * (1f - near)
        val offset = offsetMax * close
        val shift = phaseShift * near.pow(1.2f)
        val baseY0 = cyAt?.invoke(x0) ?: cy
        val baseY1 = cyAt?.invoke(x1) ?: cy
        drawLine(
            color = color.copy(alpha = alpha),
            start = Offset(x0, baseY0 + offset + sin(x0 * k + phase + shift) * amplitude * amplitudeScale),
            end = Offset(x1, baseY1 + offset + sin(x1 * k + phase + shift) * amplitude * amplitudeScale),
            strokeWidth = thin + (thick - thin) * near,
            cap = StrokeCap.Round,
        )
        travelled += dash + gap
    }
}
