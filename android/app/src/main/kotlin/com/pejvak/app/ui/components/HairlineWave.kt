package com.pejvak.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The hairline crest that opens a sheet, and separates the dock's two halves.
 *
 * Wave.kt owns the curve; this only supplies the sheet/dock's standard amplitude,
 * wavelength and taper, so the two places cannot drift into two different seas.
 */
@Composable
fun HairlineWave(
    modifier: Modifier = Modifier,
    color: Color = LocalPejvakTokens.current.glassBorder,
    height: Dp = 6.dp,
    phase: Float = 0.6f,
) {
    val geo = LocalPejvakGeometry.current
    Canvas(
        modifier
            .fillMaxWidth()
            .height(height),
    ) {
        val cy = size.height / 2f
        drawPath(
            path = wavePath(
                from = 0f,
                to = size.width,
                cy = cy,
                amplitude = 1.2.dp.toPx(),
                wavelength = 48.dp.toPx(),
                phase = phase,
                taper = 12.dp.toPx(),
                variation = 0.5f,
            ),
            color = color,
            style = Stroke(width = 1.dp.toPx(), cap = StrokeCap.Round),
        )
    }
}
