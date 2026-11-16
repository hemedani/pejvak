package com.pejvak.app.ui.screens.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.NoteHit
import com.pejvak.app.domain.describeNoteOrigin
import com.pejvak.app.domain.describeNoteTags
import com.pejvak.app.domain.formatClock
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.HighlightedTextRanges
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.notes.colorFromHex
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One note in the Notes list: its words are the headline (with the search hit
 * highlighted), the track and clock support it, and the leading tile carries the
 * same colour as the marker on the player's timeline.
 */
@Composable
fun NoteRow(
    hit: NoteHit,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val note = hit.note
    val annotation = note.annotation
    val tint = annotation.color?.let(::colorFromHex) ?: tokens.accent
    val tags = describeNoteTags(annotation.tags)
    val meta = hit.matched ?: describeNoteOrigin(note)

    GlassCard(
        modifier = modifier.fillMaxWidth(),
        rimLight = false,
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(
                    onClickLabel = stringResource(R.string.notes_open_hint),
                    onClick = onOpen,
                )
                .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(geo.tiles.md)
                    .clip(RoundedCornerShape(geo.radius.sm))
                    .background(tint.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                PejvakIcon(
                    name = "notes",
                    contentDescription = null,
                    tint = tint,
                    size = geo.icons.md,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = geo.spacing.md),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
            ) {
                HighlightedTextRanges(
                    text = annotation.text,
                    ranges = hit.ranges,
                    color = tokens.text,
                    maxLines = 3,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    text = meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (tags != null) {
                    Text(
                        text = tags,
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(
                modifier = Modifier.padding(start = geo.spacing.sm),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
            ) {
                Text(
                    text = formatClock(annotation.positionSec),
                    style = MaterialTheme.typography.labelSmall,
                    color = tint,
                )
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("trash"),
                    contentDescription = stringResource(
                        R.string.notes_row_delete,
                        formatClock(annotation.positionSec),
                    ),
                    onClick = onDelete,
                    size = geo.controls.sm,
                )
            }
        }
    }
}
