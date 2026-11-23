package com.pejvak.app.ui.components.history

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.ui.components.WAVE_WAVELENGTH_DP
import com.pejvak.app.ui.components.ramp
import com.pejvak.app.ui.components.waveOffsetAt
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A session's span across its track (DESING.md history).
 *
 * The whole line is the file and the lit stretch is what was heard, drawn with the
 * volume slider's technique: **one continuous wave across the full range with a wide
 * taper at both ends** (so the line is flat where it enters and leaves), then the heard
 * window is that *same path* clipped and re-stroked in [heardColor]. Because both colours
 * are one curve, they meet exactly at the head and the line never breaks there. [heardColor]
 * is the track's own aurora identity (DESING.md §3.5) so a finished listen is tinted like
 * the thing that was heard, not a fixed accent. A seek leaves a tick at the far edge.
 */
@Composable
fun ListeningTimeline(
    startPositionSec: Int,
    endPositionSec: Int?,
    durationSec: Int,
    seeked: Boolean,
    heardColor: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val total = durationSec.coerceAtLeast(1).toFloat()
    val start = startPositionSec.coerceIn(0, total.toInt()).toFloat() / total
    val end = (endPositionSec ?: startPositionSec).coerceIn(0, total.toInt()).toFloat() / total
    val low = minOf(start, end)
    val high = maxOf(start, end)
    val heardSec = (high - low) * durationSec

    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.history_timeline_heard),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(
                    R.string.history_timeline_span,
                    formatDuration(heardSec.toInt()),
                    formatDuration(durationSec),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = heardColor,
            )
        }
        Spacer(Modifier.height(geo.spacing.xs))
        val headInset = with(LocalDensity.current) { 6.dp.toPx() }
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(28.dp),
        ) {
            val cy = size.height / 2f
            val left = headInset
            val right = size.width - headInset
            val usable = (right - left).coerceAtLeast(1f)
            val wavelength = WAVE_WAVELENGTH_DP.dp.toPx() * 0.95f
            val amplitude = 4.6.dp.toPx()
            val variation = 0.22f
            val taper = (usable * 0.22f).coerceAtLeast(20.dp.toPx())

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
            // The whole file as a calm swell first.
            drawPath(
                path = track,
                color = tokens.glassBorder,
                style = Stroke(width = 2.2.dp.toPx(), cap = StrokeCap.Round),
            )
            if (high > low) {
                val from = left + usable * low
                val to = left + usable * high
                // Clip the same full-range path to the heard window; teal re-stroke.
                clipRect(left = from, top = 0f, right = to, bottom = size.height) {
                    drawPath(
                        path = track,
                        color = heardColor,
                        style = Stroke(width = 3.6.dp.toPx(), cap = StrokeCap.Round),
                    )
                }
                // The head sits on the curve at the far edge of the heard span.
                val edgeFade = ramp(to - left, taper) * ramp(right - to, taper)
                val headY = cy + edgeFade * waveOffsetAt(to, amplitude, wavelength, 0f, variation)
                drawCircle(heardColor.copy(alpha = 0.18f), 7.dp.toPx(), Offset(to, headY))
                drawCircle(heardColor, 3.6.dp.toPx(), Offset(to, headY))
                if (seeked) {
                    drawLine(
                        color = tokens.text.copy(alpha = 0.7f),
                        start = Offset(to, 3.dp.toPx()),
                        end = Offset(to, size.height - 3.dp.toPx()),
                        strokeWidth = 1.5.dp.toPx(),
                        cap = StrokeCap.Round,
                    )
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = formatClock(startPositionSec),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
            Text(
                text = endPositionSec?.let { formatClock(it) } ?: stringResource(R.string.history_in_progress),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
        }
    }
}
