package com.pejvak.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The read-only sibling of [WaveSlider]: the same water, no handle.
 *
 * Used wherever a value has to be *shown* rather than changed — how far into a track a
 * partial listen got, where a session's span sat inside its file. It borrows the slider's
 * exact technique (DESING.md §9.4): **one continuous wave across the whole range, with a
 * wide taper at both ends so the line is flat where it enters and where it leaves**, then
 * the played stretch is the *same path* clipped and re-stroked in the accent. Because both
 * colours are one curve, they meet exactly at the head and the line never breaks there —
 * the old version built the played part as a second path with a different wavelength, which
 * is what made it look worse than the volume slider.
 */
@Composable
fun WaveProgressBar(
    fraction: Float,
    modifier: Modifier = Modifier,
    height: Dp = 22.dp,
    color: Color? = null,
    showHead: Boolean = true,
    restingColor: Color? = null,
) {
    val tokens = LocalPejvakTokens.current
    val accent = color ?: tokens.accent
    val resting = restingColor ?: tokens.glassBorder
    val value = fraction.coerceIn(0f, 1f)
    // The head stops half a dot short of each edge so the marker at 0 % or 100 % is a
    // whole dot rather than a half one clipped by the layout.
    val headInset = with(LocalDensity.current) { 5.dp.toPx() }
    Canvas(modifier.fillMaxWidth().height(height)) {
        val cy = size.height / 2f
        val left = headInset
        val right = size.width - headInset
        val usable = (right - left).coerceAtLeast(1f)
        // Absolute wavelength (never a fraction of the filled width), a little calmer
        // than the slider's so a compact bar reads as still water rather than chop.
        val wavelength = WAVE_WAVELENGTH_DP.dp.toPx() * 0.9f
        val amplitude = 4.2.dp.toPx()
        val variation = 0.22f
        // A wide fade at each end leaves the line flat where it emerges and where it
        // runs out — the quality the owner liked in the volume bar.
        val taper = (usable * 0.24f).coerceAtLeast(18.dp.toPx())
        val headX = left + usable * value

        val track = wavePath(
            from = left,
            to = right,
            cy = cy,
            amplitude = amplitude,
            wavelength = wavelength,
            phase = 0f,
            taper = taper,
            variation = variation,
        )
        // The whole range first, dim and a touch thinner.
        drawPath(
            path = track,
            color = resting,
            style = Stroke(width = 2.2.dp.toPx(), cap = StrokeCap.Round),
        )
        if (value > 0f) {
            // Clip the *same* full-range path: the played stretch follows the end taper
            // too, so the two colours are one curve meeting exactly at the head.
            clipRect(left = left, top = 0f, right = headX, bottom = size.height) {
                drawPath(
                    path = track,
                    color = accent,
                    style = Stroke(width = 3.4.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        if (showHead) {
            // The head sits on the curve, not on the axis — same evaluation the path used,
            // including the end fade, so it never floats off a flattened edge.
            val edgeFade = ramp(headX - left, taper) * ramp(right - headX, taper)
            val headY = cy + edgeFade * waveOffsetAt(headX, amplitude, wavelength, 0f, variation)
            drawCircle(accent.copy(alpha = 0.16f), 8.dp.toPx(), Offset(headX, headY))
            drawCircle(accent, 4.4.dp.toPx(), Offset(headX, headY))
        }
    }
}
