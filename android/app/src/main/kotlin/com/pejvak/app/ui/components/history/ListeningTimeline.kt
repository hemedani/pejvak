package com.pejvak.app.ui.components.history

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.formatClock
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A session's span across its track (DESING.md history): the whole bar is the
 * file, the lit range is what was heard. A seek is marked with a second accent
 * tick so an interrupted listen can be read at a glance.
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
    Column(modifier) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(geo.spacing.md)
                .padding(vertical = geo.spacing.xs),
        ) {
            val radius = CornerRadius(size.height / 2f, size.height / 2f)
            drawRoundRect(color = tokens.glassFill, cornerRadius = radius)
            if (high > low) {
                drawRoundRect(
                    color = tokens.accent,
                    topLeft = Offset(size.width * low, 0f),
                    size = Size(size.width * (high - low), size.height),
                    cornerRadius = radius,
                )
            }
            if (seeked) {
                val x = size.width * high
                drawRoundRect(
                    color = tokens.text,
                    topLeft = Offset(x - 1.dp.toPx(), 0f),
                    size = Size(2.dp.toPx(), size.height),
                    cornerRadius = CornerRadius(1.dp.toPx(), 1.dp.toPx()),
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text(
                text = formatClock(startPositionSec),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = endPositionSec?.let { formatClock(it) } ?: stringResource(R.string.history_in_progress),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
        }
    }
}
