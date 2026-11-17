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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The read-only sibling of [WaveSlider]: the same track, no handle.
 *
 * Used wherever a value has to be *shown* rather than changed — how far into a track a
 * partial listen got, where a session's span sat inside its file. Same curve, same
 * accents, so a progress readout looks like the player instead of like a generic bar.
 */
@Composable
fun WaveProgressBar(
    fraction: Float,
    modifier: Modifier = Modifier,
    height: Dp = 16.dp,
    color: Color? = null,
    showHead: Boolean = true,
    restingColor: Color? = null,
) {
    val tokens = LocalPejvakTokens.current
    val accent = color ?: tokens.accent
    val resting = restingColor ?: tokens.glassBorder
    val value = fraction.coerceIn(0f, 1f)
    Canvas(modifier.fillMaxWidth().height(height)) {
        val cy = size.height / 2f
        val wavelength = 40.dp.toPx()
        val amplitude = 1.9.dp.toPx()
        drawPath(
            path = wavePath(
                from = 0f,
                to = size.width,
                cy = cy,
                amplitude = amplitude * 0.45f,
                wavelength = wavelength * 1.7f,
                phase = 0f,
                taper = 8.dp.toPx(),
                variation = 0.35f,
            ),
            color = resting,
            style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round),
        )
        val headX = size.width * value
        if (headX <= 0f) return@Canvas
        drawPath(
            path = wavePath(
                from = 0f,
                to = headX,
                cy = cy,
                amplitude = amplitude,
                wavelength = wavelength,
                phase = 0f,
                taper = 5.dp.toPx(),
                variation = 0.2f,
                taperEnd = 0f,
            ),
            color = accent,
            style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
        )
        if (showHead) {
            val headY = cy + waveOffsetAt(headX, amplitude, wavelength, 0f, 0.2f)
            drawCircle(accent.copy(alpha = 0.18f), 5.dp.toPx(), Offset(headX, headY))
            drawCircle(accent, 2.6.dp.toPx(), Offset(headX, headY))
        }
    }
}
