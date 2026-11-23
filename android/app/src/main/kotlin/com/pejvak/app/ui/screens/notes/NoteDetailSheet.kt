package com.pejvak.app.ui.screens.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.NoteWithTrack
import com.pejvak.app.domain.describeNoteFacts
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.noteMarkers
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.RowDivider
import com.pejvak.app.ui.components.notes.NoteTimeline
import com.pejvak.app.ui.components.notes.colorFromHex
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One note opened: its words first and in its own colour, then its facts, its
 * place among the track's other notes, and the actions that act on it. This is
 * the note branch of the History sheet's SessionDetailSheet; the listening branch
 * arrives with Phase 9.
 */
@Composable
fun NoteDetailSheet(
    note: NoteWithTrack,
    trackNotes: List<Annotation>,
    onClose: () -> Unit,
    onResume: () -> Unit,
    onEdit: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val annotation = note.annotation
    val tint = annotation.color?.let(::colorFromHex) ?: tokens.accent
    val siblings = trackNotes.ifEmpty { listOf(annotation) }
    val markers = noteMarkers(note.track.durationSec, siblings, annotation.id)
    var confirmDelete by remember { mutableStateOf(false) }

    GlassSheet(onDismiss = onClose) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(bottom = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
            ) {
                Box(
                    modifier = Modifier
                        .size(geo.controls.lg)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                listOf(
                                    tokens.accentTeal.copy(alpha = 0.34f),
                                    tokens.glassFill,
                                ),
                            ),
                        )
                        .border(1.dp, tokens.glassBorder, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    PejvakIcon(
                        name = "note",
                        contentDescription = null,
                        tint = tokens.accentTeal,
                        size = geo.icons.md,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                ) {
                    Text(
                        text = stringResource(R.string.note_detail_overline).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                    Text(
                        text = note.track.title,
                        style = MaterialTheme.typography.headlineMedium,
                        color = tokens.text,
                    )
                    Text(
                        text = stringResource(R.string.note_detail_at, formatClock(annotation.positionSec)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = tint,
                    )
                }
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("close"),
                    contentDescription = stringResource(R.string.note_detail_close),
                    onClick = onClose,
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(tint.copy(alpha = 0.10f), RoundedCornerShape(geo.radius.md))
                    .drawBehind {
                        drawRect(color = tint, size = Size(3.dp.toPx(), size.height))
                    }
                    .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.md),
            ) {
                Text(
                    text = annotation.text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.text,
                )
            }

            if (markers.isNotEmpty()) {
                NoteTimeline(
                    markers = markers,
                    durationSec = note.track.durationSec,
                    tint = tint,
                )
            }

            Column {
                describeNoteFacts(note, note.track.durationSec).forEachIndexed { index, fact ->
                    if (index > 0) RowDivider()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = geo.spacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = fact.label,
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.textSecondary,
                            modifier = Modifier.weight(0.4f),
                        )
                        Text(
                            text = fact.value,
                            style = MaterialTheme.typography.bodyMedium,
                            color = tokens.text,
                            textAlign = TextAlign.End,
                            modifier = Modifier.weight(0.6f),
                        )
                    }
                }
            }

            PrimaryButton(
                label = stringResource(R.string.note_detail_resume, formatClock(annotation.positionSec)),
                onClick = onResume,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassChip(
                    label = stringResource(R.string.note_detail_edit),
                    icon = "edit",
                    onClick = onEdit,
                )
                GlassChip(
                    label = stringResource(R.string.note_detail_share),
                    icon = "share",
                    onClick = onShare,
                )
                GlassChip(
                    label = stringResource(R.string.note_detail_delete),
                    icon = "trash",
                    onClick = { confirmDelete = true },
                    modifier = Modifier.border(
                        1.dp,
                        tokens.danger,
                        RoundedCornerShape(geo.radius.pill),
                    ),
                )
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = tokens.canvasBase,
            titleContentColor = tokens.text,
            textContentColor = tokens.textSecondary,
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    PejvakIcon("warning", null, tint = tokens.danger, size = geo.icons.md)
                    Text(stringResource(R.string.notes_delete_title))
                }
            },
            text = {
                Text(
                    stringResource(
                        R.string.notes_delete_body,
                        annotation.text,
                        note.track.title,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        onDelete()
                    },
                ) {
                    Text(stringResource(R.string.notes_delete_action), color = tokens.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text(stringResource(R.string.notes_cancel), color = tokens.text)
                }
            },
        )
    }
}
