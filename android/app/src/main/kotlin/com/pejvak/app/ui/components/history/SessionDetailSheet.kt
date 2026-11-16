package com.pejvak.app.ui.components.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.describeSessionStatus
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.domain.formatTimeRange
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** One recorded session in full: timeline, facts, resume and tombstone delete. */
@Composable
fun SessionDetailSheet(
    item: HistoryItem,
    onDismiss: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val session = item.session
    GlassSheet(onDismiss = onDismiss, title = item.track.title) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            Text(
                text = item.contextTitle ?: stringResource(R.string.history_single_track),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
            )
            ListeningTimeline(
                startPositionSec = session.startPositionSec,
                endPositionSec = session.endPositionSec,
                durationSec = item.track.durationSec,
                seeked = session.seeked,
            )
            GlassCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    Fact(stringResource(R.string.history_fact_when), formatTimeRange(session.startedAt, session.endedAt))
                    Fact(stringResource(R.string.history_fact_listened), formatDuration(session.durationListenedSec))
                    Fact(stringResource(R.string.history_fact_speed), formatSpeed(session.playbackSpeed))
                    describeSessionStatus(session)?.let {
                        Fact(stringResource(R.string.history_fact_status), it)
                    }
                    session.deviceInfo?.let {
                        Fact(stringResource(R.string.history_fact_device), it)
                    }
                }
            }
            PrimaryButton(
                label = stringResource(R.string.history_resume),
                onClick = {
                    onResume()
                    onDismiss()
                },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("delete"),
                    contentDescription = stringResource(R.string.action_delete),
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun Fact(label: String, value: String) {
    val tokens = LocalPejvakTokens.current
    Row(Modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
    }
}
