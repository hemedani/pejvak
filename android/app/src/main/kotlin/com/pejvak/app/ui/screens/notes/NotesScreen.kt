package com.pejvak.app.ui.screens.notes

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.NoteWithTrack
import com.pejvak.app.domain.describeDateRange
import com.pejvak.app.domain.isRangeActive
import com.pejvak.app.domain.pickAnnotationColor
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.HeaderSearch
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SyncWaveLoader
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.notes.AnnotationComposerSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

/**
 * Every note the listener has written, in one searchable list. Notes are created
 * inside the player; this screen is the index — by words, track, tags or folder,
 * and narrowed by a date range. Tapping a row opens the note; the row's trash
 * action asks before deleting.
 */
@Composable
fun NotesScreen(
    onOpenPlayer: () -> Unit,
    onCreateChannel: () -> Unit,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotesViewModel = hiltViewModel(),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val selected by viewModel.selected.collectAsStateWithLifecycle()
    val trackNotes by viewModel.trackNotes.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Plan 09 UX-05b: online-first — pull the newest server notes on every entry, not just the
    // first composition (the dock keeps this ViewModel across tab switches).
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResume() }

    var showDate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<NoteWithTrack?>(null) }
    var pendingDelete by remember { mutableStateOf<NoteWithTrack?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    val now = remember { System.currentTimeMillis() }

    val searching = state.query.isNotBlank()
    val rangeActive = isRangeActive(state.range)
    val filtering = searching || rangeActive
    val subtitle = when {
        searching -> stringResource(R.string.notes_count_of, state.rows.size, state.datedTotal)
        state.datedTotal == 1 && rangeActive -> stringResource(R.string.notes_count_in_range_one)
        state.datedTotal > 0 && rangeActive -> stringResource(R.string.notes_count_in_range, state.datedTotal)
        state.datedTotal == 1 -> stringResource(R.string.notes_count_one)
        state.datedTotal > 0 -> stringResource(R.string.notes_count, state.datedTotal)
        else -> null
    }

    ScreenFrame(
        modifier = modifier,
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                overline = stringResource(R.string.notes_overline),
                title = stringResource(R.string.notes_title),
                subtitle = subtitle,
                search = HeaderSearch(
                    value = state.query,
                    onValueChange = viewModel::setQuery,
                    placeholder = stringResource(R.string.notes_search_placeholder),
                ),
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("add"),
                        contentDescription = stringResource(R.string.my_channels_new),
                        onClick = onCreateChannel,
                    )
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("more"),
                        contentDescription = stringResource(R.string.header_more),
                        onClick = { menuOpen = true },
                    )
                },
            )
        },
    ) { topInset ->
        OceanCascade(key = state.rows.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = geo.spacing.xl,
                    end = geo.spacing.xl,
                    top = topInset + geo.spacing.sm,
                    bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
                ),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                if (searching) {
                    item {
                        Text(
                            text = stringResource(R.string.notes_search_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.textTertiary,
                        )
                    }
                }

                // Plan 09 UX-05: an elegant wave loader while the online-first server check runs,
                // and a non-blocking notice if the last check failed (with a retry).
                if (state.syncing) {
                    item { SyncWaveLoader(message = stringResource(R.string.notes_syncing)) }
                }
                if (state.syncNotice != null) {
                    item {
                        InlineNotice(
                            message = state.syncNotice!!,
                            tone = NoticeTone.Warning,
                            title = stringResource(R.string.notes_sync_failed),
                            retryLabel = stringResource(R.string.action_retry),
                            onRetry = viewModel::retrySync,
                        )
                    }
                }

                when {
                    state.loading && !state.syncing -> item { SkeletonRows(count = 4) }

                    state.rows.isEmpty() -> item {
                        if (filtering) {
                            EmptyState(
                                icon = "search",
                                title = if (searching) {
                                    stringResource(R.string.notes_no_match_title, state.query.trim())
                                } else {
                                    stringResource(R.string.notes_no_range_title)
                                },
                                body = when {
                                    searching && rangeActive -> stringResource(R.string.notes_no_match_body_range)
                                    searching -> stringResource(R.string.notes_no_match_body)
                                    else -> stringResource(R.string.notes_no_range_body)
                                },
                                modifier = Modifier.oceanEntrance(0),
                            )
                        } else if (!state.signedIn && !state.syncing) {
                            // The notes live on the server under the account — a signed-out install
                            // cannot pull them, so explain and offer the way in rather than a dead end.
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(geo.spacing.xl),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
                            ) {
                                EmptyState(
                                    icon = "notes",
                                    title = stringResource(R.string.notes_sign_in_title),
                                    body = stringResource(R.string.notes_sign_in_body),
                                )
                                PrimaryButton(
                                    label = stringResource(R.string.notes_sign_in_action),
                                    onClick = onOpenAccount,
                                )
                            }
                        } else {
                            EmptyState(
                                icon = "notes",
                                title = stringResource(R.string.notes_empty_title),
                                body = stringResource(R.string.notes_empty_body),
                                modifier = Modifier.oceanEntrance(0),
                            )
                        }
                    }

                    else -> itemsIndexed(state.rows, key = { _, hit -> hit.note.annotation.id }) { idx, hit ->
                        NoteRow(
                            hit = hit,
                            onOpen = { viewModel.open(hit.note) },
                            onDelete = { pendingDelete = hit.note },
                            modifier = Modifier.oceanEntrance(idx, staggerEnabled = !searching),
                        )
                    }
                }
            }
        }
    }

    if (menuOpen) {
        GlassSheet(
            onDismiss = { menuOpen = false },
            title = stringResource(R.string.header_actions),
            icon = "time",
        ) {
            ListRow(
                title = stringResource(R.string.header_date_range),
                subtitle = describeDateRange(state.range, now),
                leading = { PejvakIcon("time", null, tint = tokens.textSecondary, size = geo.icons.md) },
                onClick = {
                    menuOpen = false
                    showDate = true
                },
            )
            Spacer(Modifier.height(geo.spacing.xl))
        }
    }

    if (showDate) {
        NotesDateRangeSheet(
            range = state.range,
            onApply = viewModel::setRange,
            onClose = { showDate = false },
        )
    }

    selected?.let { note ->
        NoteDetailSheet(
            note = note,
            trackNotes = trackNotes,
            onClose = viewModel::closeDetail,
            onResume = {
                viewModel.resume(note)
                viewModel.closeDetail()
                onOpenPlayer()
            },
            onEdit = {
                editing = note
                viewModel.closeDetail()
            },
            onShare = {
                shareNotes(
                    context = context,
                    markdown = viewModel.markdown(note),
                    subject = context.getString(R.string.note_detail_share_subject, note.track.title),
                    chooser = context.getString(R.string.note_detail_share_chooser),
                )
            },
            onDelete = { viewModel.delete(note) },
        )
    }

    editing?.let { note ->
        AnnotationComposerSheet(
            positionSec = note.annotation.positionSec,
            annotation = note.annotation,
            initialColor = note.annotation.color ?: pickAnnotationColor(0),
            onCancel = { editing = null },
            onSave = { text, tags, color ->
                val saved = viewModel.saveEdit(note, text, tags, color)
                if (saved) editing = null
                saved
            },
        )
    }

    pendingDelete?.let { note ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
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
                        note.annotation.text,
                        note.track.title,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        viewModel.delete(note)
                    },
                ) {
                    Text(stringResource(R.string.notes_delete_action), color = tokens.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.notes_cancel), color = tokens.text)
                }
            },
        )
    }
}

private fun shareNotes(context: Context, markdown: String, subject: String, chooser: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, markdown)
    }
    context.startActivity(Intent.createChooser(intent, chooser))
}
