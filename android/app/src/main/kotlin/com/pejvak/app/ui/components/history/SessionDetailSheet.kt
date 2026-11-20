package com.pejvak.app.ui.components.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.CollectionKind
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.describeSessionStatus
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.domain.formatTimeRange
import com.pejvak.app.domain.playbackContextFacts
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One recorded session in full: the wave timeline of where the listen got to, the
 * facts, resume and a tombstone delete.
 *
 * The track title heads the sheet with the collection it was played from as the
 * subtitle, so the sheet states what it is about before the numbers start — the old
 * version opened on a bare title and a flat bar, which is what read as unappealing.
 */
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
    GlassSheet(
        onDismiss = onDismiss,
        title = item.track.title,
        subtitle = item.contextTitle ?: stringResource(R.string.history_single_track),
        icon = "history",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.lg)) {
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
            PlaybackContextCard(item)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                Box(Modifier.weight(1f)) {
                    PrimaryButton(
                        label = stringResource(R.string.history_resume),
                        onClick = {
                            onResume()
                            onDismiss()
                        },
                    )
                }
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
private fun PlaybackContextCard(item: HistoryItem) {
    val facts = item.playbackContextFacts()
    GlassCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.sm)) {
            Fact(
                stringResource(R.string.history_fact_collection_kind),
                stringResource(
                    if (facts.kind == CollectionKind.Collection) {
                        R.string.history_collection_kind_collection
                    } else {
                        R.string.history_collection_kind_standalone
                    },
                ),
            )
            facts.title?.let { Fact(stringResource(R.string.history_fact_collection_title), it) }
            facts.order?.let { Fact(stringResource(R.string.history_fact_order), it) }
            facts.ambience?.let { Fact(stringResource(R.string.history_fact_ambience), it) }
            Fact(stringResource(R.string.history_fact_volume), facts.volume)
            facts.enhancer?.let { Fact(stringResource(R.string.history_fact_enhancer), it) }
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
            modifier = Modifier
                .weight(1f)
                .padding(end = 8.dp),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
    }
}
