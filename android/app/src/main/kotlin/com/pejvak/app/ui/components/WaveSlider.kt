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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
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
        targetValue = if (dragging && motion) 1f else 0.72f,
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
            .height(46.dp)
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
        // Fewer crests than the scrubber's 64 dp: the slider sits under a label, not
        // under a timeline, so a longer swell reads calmer rather than busier.
        val wavelength = WAVE_WAVELENGTH_DP.dp.toPx() * 1.5f
        val amplitude = 6.dp.toPx() * liveliness
        val variation = 0.22f
        val left = thumbInset
        val right = size.width - thumbInset
        val usable = (right - left).coerceAtLeast(1f)
        // A wide fade at each end leaves the line flat where it emerges and where it
        // runs out, with the swell living in the middle.
        val taper = (usable * 0.22f).coerceAtLeast(20.dp.toPx())
        val headX = left + usable * fraction

        // One continuous wave from end to end, so the played part is not a second
        // shape glued on: it is the same water, lit up. The unplayed stretch keeps the
        // same crests and phase, just dimmer and a touch thinner — dots and a shallower
        // amplitude made the line break at the thumb and read as a dashed rule.
        val track = wavePath(
            from = left,
            to = right,
            cy = cy,
            amplitude = amplitude,
            wavelength = wavelength,
            phase = phase,
            taper = taper,
            variation = variation,
        )
        drawPath(
            path = track,
            color = tokens.glassBorder,
            style = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round),
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
            // Clip the *same* full-range path rather than building a shorter one: the
            // played stretch then follows the end taper too, so the two colours are one
            // curve meeting exactly at the thumb.
            clipRect(left = left, top = 0f, right = headX, bottom = size.height) {
                drawPath(
                    path = track,
                    color = tokens.accent,
                    style = Stroke(width = 3.8.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        // The thumb sits on the curve, not on the axis — same evaluation the path used,
        // including the end fade, so it never floats off a flattened edge.
        val edgeFade = ramp(headX - left, taper) * ramp(right - headX, taper)
        val headY = cy + edgeFade * waveOffsetAt(headX, amplitude, wavelength, phase, variation)
        drawCircle(tokens.accent.copy(alpha = 0.16f), 9.5.dp.toPx(), Offset(headX, headY))
        drawCircle(tokens.accent, 5.dp.toPx(), Offset(headX, headY))
    }
}
