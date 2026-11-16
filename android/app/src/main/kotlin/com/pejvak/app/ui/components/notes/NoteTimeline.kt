package com.pejvak.app.ui.components.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pejvak.app.domain.NoteMarker
import com.pejvak.app.domain.describeNoteTimeline
import com.pejvak.app.domain.formatClock
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A track's length with its notes on it. There is no fill: a note is not a
 * quantity of listening. The open note's tick is taller and in its own colour so
 * it matches the row's tile and the player's marker.
 */
@Composable
fun NoteTimeline(
    markers: List<NoteMarker>,
    durationSec: Int,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(28.dp)
                .background(tint.copy(alpha = 0.14f), RoundedCornerShape(geo.radius.xs)),
        ) {
            markers.forEach { marker ->
                Box(
                    modifier = Modifier
                        .offset(x = maxWidth * marker.ratio - 1.dp, y = if (marker.current) (-4).dp else 6.dp)
                        .width(2.dp)
                        .height(if (marker.current) 36.dp else 16.dp)
                        .background(
                            if (marker.current) tint else tokens.textTertiary.copy(alpha = 0.6f),
                            RoundedCornerShape(1.dp),
                        ),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = formatClock(0),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textTertiary,
            )
            Text(
                text = formatClock(durationSec),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textTertiary,
            )
        }
        Text(
            text = describeNoteTimeline(markers.size),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textSecondary,
        )
    }
}
