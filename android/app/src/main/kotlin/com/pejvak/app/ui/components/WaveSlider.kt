package com.pejvak.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlin.math.roundToInt

/**
 * The app's slider.
 *
 * Material's slider is a rule with a knob on it, which reads as a form control; this
 * app's language is water. So the track is the same wave the scrubber draws, the set
 * value is the part of it that has been played through, and the thumb is a body riding
 * the crest — when you drag, the wave starts moving and the thumb leaves a wake, so the
 * control feels alive under the finger and settles when released.
 *
 * Used for volume, room tone, the enhancer gains — anything with a value along a range.
 */
@Composable
fun WaveSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    range: ClosedFloatingPointRange<Float> = 0f..1f,
    step: Float = 0f,
    enabled: Boolean = true,
    contentDescription: String? = null,
    onValueChangeFinished: () -> Unit = {},
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val haptics = rememberHaptics()
    var dragging by remember { mutableStateOf(false) }

    val span = (range.endInclusive - range.start).takeIf { it > 0f } ?: 1f
    val fraction = ((value - range.start) / span).coerceIn(0f, 1f)
    // The track stops half a thumb short of each edge so the handle at 0 % or 100 %
    // is a whole dot rather than a half one clipped by the layout.
    val thumbInset = with(LocalDensity.current) { 5.dp.toPx() }

    // Always started, never conditionally composed: the wave only *drifts* while the
    // finger is down, but the composition structure stays identical either way.
    val livePhase = rememberWavePhase(periodMillis = 3_200)
    val phase = if (dragging && motion) livePhase else 0f
    val liveliness by animateFloatAsState(
        targetValue = if (dragging && motion) 1f else 0.62f,
        animationSpec = tween(260),
        label = "sliderLiveliness",
    )

    fun emit(x: Float, width: Float) {
        val inset = thumbInset
        val usable = width - inset * 2f
        if (usable <= 0f) return
        val raw = range.start + ((x - inset) / usable).coerceIn(0f, 1f) * span
        val snapped = if (step > 0f) {
            val ticks = ((raw - range.start) / step).roundToInt()
            (range.start + ticks * step).coerceIn(range.start, range.endInclusive)
        } else {
            raw
        }
        if (snapped != value) {
            haptics.trigger(HapticIntent.Scrub)
            onValueChange(snapped)
        }
    }

    val a11y = contentDescription.orEmpty()
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
            .semantics {
                this.contentDescription = a11y
                progressBarRangeInfo = ProgressBarRangeInfo(value, range)
                setProgress { target ->
                    onValueChange(target.coerceIn(range.start, range.endInclusive))
                    true
                }
            }
            .pointerInput(enabled, range, step) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    dragging = true
                    haptics.trigger(HapticIntent.Press)
                    emit(down.position.x, size.width.toFloat())
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: break
                        if (!change.pressed) break
                        emit(change.position.x, size.width.toFloat())
                        change.consume()
                    }
                    dragging = false
                    onValueChangeFinished()
                }
            },
    ) {
        val cy = size.height / 2f
        val wavelength = 46.dp.toPx()
        val amplitude = 4.2.dp.toPx() * liveliness
        val left = thumbInset
        val right = size.width - thumbInset
        val usable = (right - left).coerceAtLeast(1f)
        val headX = left + usable * fraction

        // The whole range, at rest — dotted, the way the scrubber draws water it has
        // not reached yet. A solid line here read as "this is the value"; dots read as
        // "this is the range still available", which is what the rest of the track is.
        drawPath(
            path = wavePath(
                from = left,
                to = right,
                cy = cy,
                amplitude = amplitude * 0.5f,
                wavelength = wavelength * 1.7f,
                phase = 0f,
                taper = 10.dp.toPx(),
                variation = 0.35f,
            ),
            color = tokens.glassBorder,
            style = Stroke(
                width = 1.5.dp.toPx(),
                cap = StrokeCap.Round,
                pathEffect = PathEffect.dashPathEffect(
                    floatArrayOf(2.4.dp.toPx(), 4.2.dp.toPx()),
                ),
            ),
        )

        if (dragging && motion) {
            drawWaveWake(
                headX = headX, cy = cy, spread = -6.dp.toPx(),
                phaseShift = 1.2f, amplitude = amplitude, phase = phase,
                color = tokens.accent, scale = 1f,
                lengthDp = 64f, wavelength = wavelength, alphaBase = 0.5f,
            )
            drawWaveWake(
                headX = headX, cy = cy, spread = 4.6.dp.toPx(),
                phaseShift = -1.7f, amplitude = amplitude, phase = phase,
                color = tokens.accent, scale = 1f,
                lengthDp = 52f, wavelength = wavelength, alphaBase = 0.42f,
            )
        }
        if (fraction > 0f) {
            drawPath(
                path = wavePath(
                    from = left,
                    to = headX,
                    cy = cy,
                    amplitude = amplitude,
                    wavelength = wavelength,
                    phase = phase,
                    taper = 6.dp.toPx(),
                    variation = 0.2f,
                    taperEnd = 0f,
                ),
                color = tokens.accent,
                style = Stroke(width = 2.6.dp.toPx(), cap = StrokeCap.Round),
            )
        }
        // The thumb sits on the curve, not on the axis — same evaluation the path used.
        val headY = cy + waveOffsetAt(headX, amplitude, wavelength, phase, 0.2f)
        drawCircle(tokens.accent.copy(alpha = 0.16f), 8.5.dp.toPx(), Offset(headX, headY))
        drawCircle(tokens.accent, 4.5.dp.toPx(), Offset(headX, headY))
    }
}
