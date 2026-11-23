package com.pejvak.app.ui.components.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import com.pejvak.app.R
import com.pejvak.app.domain.CollectionKind
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.describeSessionStatus
import com.pejvak.app.domain.formatDayOfWeek
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.domain.formatTimeRange
import com.pejvak.app.domain.historySubtitle
import com.pejvak.app.domain.paletteIndexFor
import com.pejvak.app.domain.playbackContextFacts
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One recorded session in full: the wave timeline of where the listen got to, the
 * facts, resume and a tombstone delete.
 *
 * The track title heads the sheet with the collection it was played from as the
 * subtitle, so the sheet states what it is about before the numbers start. The facts
 * are split into two titled sections — **Session** and **Playback** — each row carrying
 * a leading glyph so a meaningful label reads as one, not as bare text.
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
    // The track's own aurora identity (light stop, the legible one on glass) tints the
    // heard stretch so the sheet reads as *this* track rather than a fixed accent.
    val heardColor: Color = AuroraRamps[paletteIndexFor(item.track.contentHash)].third
    GlassSheet(
        onDismiss = onDismiss,
        title = item.track.title,
        subtitle = item.historySubtitle() ?: stringResource(R.string.history_single_track),
        icon = "history",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.lg)) {
            ListeningTimeline(
                startPositionSec = session.startPositionSec,
                endPositionSec = session.endPositionSec,
                durationSec = item.track.durationSec,
                seeked = session.seeked,
                heardColor = heardColor,
            )
            SectionCard(icon = "event", title = stringResource(R.string.history_section_session)) {
                Fact("calendar", stringResource(R.string.history_fact_day), formatDayOfWeek(session.startedAt))
                Fact("time", stringResource(R.string.history_fact_when), formatTimeRange(session.startedAt, session.endedAt))
                Fact("duration", stringResource(R.string.history_fact_listened), formatDuration(session.durationListenedSec))
                Fact("speed", stringResource(R.string.history_fact_speed), formatSpeed(session.playbackSpeed))
                describeSessionStatus(session)?.let {
                    Fact("info", stringResource(R.string.history_fact_status), it)
                }
                session.deviceInfo?.let {
                    Fact("person", stringResource(R.string.history_fact_device), it)
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

/** A titled glass section: an icon bubble + eyebrow heading above a column of [Fact]s. */
@Composable
private fun SectionCard(icon: String, title: String, content: @Composable () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                Box(
                    modifier = Modifier
                        .size(geo.controls.sm)
                        .clip(CircleShape)
                        .background(tokens.accentTeal.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    PejvakIcon(name = icon, contentDescription = null, tint = tokens.accentTeal, size = geo.icons.sm)
                }
                Text(
                    text = title.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = tokens.textSecondary,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) { content() }
        }
    }
}

@Composable
private fun PlaybackContextCard(item: HistoryItem) {
    val facts = item.playbackContextFacts()
    SectionCard(icon = "enhancer", title = stringResource(R.string.history_section_playback)) {
        Fact(
            "folder",
            stringResource(R.string.history_fact_collection_kind),
            stringResource(
                if (facts.kind == CollectionKind.Collection) {
                    R.string.history_collection_kind_collection
                } else {
                    R.string.history_collection_kind_standalone
                },
            ),
        )
        facts.title?.let { Fact("list", stringResource(R.string.history_fact_collection_title), it) }
        facts.order?.let { Fact("sort", stringResource(R.string.history_fact_order), it) }
        facts.ambience?.let { Fact("music", stringResource(R.string.history_fact_ambience), it) }
        Fact("volume", stringResource(R.string.history_fact_volume), facts.volume)
        facts.enhancer?.let { Fact("enhancer", stringResource(R.string.history_fact_enhancer), it) }
    }
}

/** A labelled fact line with a leading glyph bubble. */
@Composable
private fun Fact(icon: String, label: String, value: String) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.sm)
                .clip(CircleShape)
                .background(tokens.glassFill),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon(name = icon, contentDescription = null, tint = tokens.textSecondary, size = geo.icons.sm)
        }
        // Both columns are weighted so a long value can never starve the label to zero
        // width (which used to wrap the label one letter per line). The label stays a
        // single line; the value is right-aligned and wraps to at most three lines.
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(top = geo.spacing.xxs),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.text,
            textAlign = TextAlign.End,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1.3f),
        )
    }
}
