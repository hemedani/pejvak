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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A session's span across its track (DESING.md history).
 *
 * The whole line is the file and the lit stretch is what was heard, but drawn as the
 * player's wave rather than a flat bar: a faint full-width swell with a brighter crest
 * riding over the heard range, closed at both ends by the same taper the scrubber uses.
 * A seek leaves a tick at the far edge. So the sheet answers "where did I get to?"
 * with the same object the player answers it with.
 */
@Composable
fun ListeningTimeline(
    startPositionSec: Int,
    endPositionSec: Int?,
    durationSec: Int,
    seeked: Boolean,
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
                color = tokens.text,
            )
        }
        Spacer(Modifier.height(geo.spacing.xs))
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(26.dp),
        ) {
            val cy = size.height / 2f
            val wavelength = 44.dp.toPx()
            drawPath(
                path = wavePath(
                    from = 0f,
                    to = size.width,
                    cy = cy,
                    amplitude = 1.6.dp.toPx(),
                    wavelength = wavelength * 1.6f,
                    phase = 0f,
                    taper = 10.dp.toPx(),
                    variation = 0.4f,
                ),
                color = tokens.glassBorder,
                style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round),
            )
            if (high > low) {
                val from = size.width * low
                val to = size.width * high
                drawPath(
                    path = wavePath(
                        from = from,
                        to = to,
                        cy = cy,
                        amplitude = 3.4.dp.toPx(),
                        wavelength = wavelength,
                        phase = 0f,
                        taper = 6.dp.toPx(),
                        variation = 0.22f,
                    ),
                    color = tokens.accent,
                    style = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round),
                )
                // The taper fades the crest into the baseline at both ends, so the
                // head sits on the baseline where the wave actually arrives.
                drawCircle(tokens.accent.copy(alpha = 0.18f), 6.dp.toPx(), Offset(to, cy))
                drawCircle(tokens.accent, 3.dp.toPx(), Offset(to, cy))
                if (seeked) {
                    drawLine(
                        color = tokens.text.copy(alpha = 0.7f),
                        start = Offset(to, 2.dp.toPx()),
                        end = Offset(to, size.height - 2.dp.toPx()),
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
