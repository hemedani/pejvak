package com.pejvak.app.ui.screens.playlist

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.describeContextStats
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ContextHistorySheet
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

@Composable
fun PlaylistDetailScreen(
    onBack: () -> Unit,
    onOpenTrack: (String) -> Unit,
    onOpenAi: () -> Unit,
    viewModel: PlaylistDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var renameOpen by remember { mutableStateOf(false) }
    var addOpen by remember { mutableStateOf(false) }
    var deleteOpen by remember { mutableStateOf(false) }
    var historyOpen by remember { mutableStateOf(false) }
    var draftTitle by remember { mutableStateOf("") }

    LaunchedEffect(state.deleted) {
        if (state.deleted) onBack()
    }

    val playlist = state.playlist
    val subtitle = buildString {
        append(stringResource(R.string.playlist_track_count, state.rows.size))
        append(" · ")
        append(formatDuration(state.rows.sumOf { it.track.durationSec }))
        describeContextStats(state.stats)?.let { append(" · $it") }
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = playlist?.title ?: "",
                overline = stringResource(R.string.library_view_playlists),
                subtitle = subtitle,
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("history"),
                        contentDescription = stringResource(R.string.context_history_title),
                        onClick = { historyOpen = true },
                    )
                },
            )
        },
    ) { topInset ->
        OceanCascade(key = state.rows.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = geo.spacing.lg,
                    end = geo.spacing.lg,
                    top = topInset + geo.spacing.md,
                    bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
                ),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
            ) {
                item {
                    PrimaryButton(
                        label = stringResource(R.string.library_play),
                        enabled = state.rows.isNotEmpty(),
                        onClick = { viewModel.play() },
                        modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                    )
                }
                item {
                    Row(
                        modifier = Modifier.oceanEntrance(1, swayDp = 0.dp),
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                    ) {
                        GlassChip(
                            label = stringResource(R.string.playlist_add_tracks),
                            icon = "addToPlaylist",
                            onClick = { addOpen = true },
                        )
                        GlassChip(
                            label = if (state.editing) stringResource(R.string.action_done)
                            else stringResource(R.string.action_edit),
                            selected = state.editing,
                            icon = "edit",
                            onClick = viewModel::toggleEditing,
                        )
                        GlassChip(
                            label = stringResource(R.string.action_rename),
                            icon = "edit",
                            onClick = {
                                draftTitle = playlist?.title.orEmpty()
                                renameOpen = true
                            },
                        )
                        GlassChip(
                            label = stringResource(R.string.action_delete),
                            icon = "delete",
                            onClick = { deleteOpen = true },
                        )
                    }
                }
                if (state.rows.isEmpty() && !state.loading) {
                    item {
                        EmptyState(
                            icon = "playlist",
                            title = stringResource(R.string.playlist_empty),
                            body = stringResource(R.string.playlist_empty_body),
                            modifier = Modifier.oceanEntrance(2, swayDp = 0.dp),
                        )
                    }
                }
                // A playlist may hold the same track twice, so the index is part of the key.
                itemsIndexed(state.rows, key = { index, row -> "$index:${row.track.id}" }) { index, row ->
                    GlassCard(
                        modifier = Modifier
                            .oceanEntrance(2 + index)
                            .clickable {
                                if (state.editing) onOpenTrack(row.track.id) else viewModel.play(index)
                            },
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            PaletteTile(
                                contentHash = row.track.contentHash,
                                label = row.track.title,
                                artworkUrl = row.track.artworkUrl,
                                size = geo.tiles.md,
                            )
                            Spacer(Modifier.size(geo.spacing.md))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    text = row.track.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = tokens.text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = formatDuration(row.track.durationSec),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.textSecondary,
                                )
                            }
                            ActionCluster {
                                if (state.editing) {
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("chevronLeft"),
                                        contentDescription = stringResource(R.string.playlist_move_up),
                                        onClick = { if (index > 0) viewModel.move(index, index - 1) },
                                    )
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("chevronRight"),
                                        contentDescription = stringResource(R.string.playlist_move_down),
                                        onClick = {
                                            if (index < state.rows.lastIndex) viewModel.move(index, index + 1)
                                        },
                                    )
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("delete"),
                                        contentDescription = stringResource(R.string.playlist_remove),
                                        onClick = { viewModel.removeTrack(row.track.id) },
                                    )
                                } else {
                                    AiActionButton(onClick = onOpenAi)
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("play"),
                                        contentDescription = stringResource(R.string.library_play),
                                        onClick = { viewModel.play(index) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (renameOpen) {
        GlassSheet(onDismiss = { renameOpen = false }, title = stringResource(R.string.action_rename), icon = "edit") {
            TextField(
                value = draftTitle,
                onValueChange = { draftTitle = it },
                label = stringResource(R.string.library_playlist_name),
                placeholder = stringResource(R.string.playlist_title_placeholder),
            )
            Spacer(Modifier.size(geo.spacing.md))
            PrimaryButton(
                label = stringResource(R.string.action_save),
                enabled = draftTitle.isNotBlank(),
                onClick = {
                    viewModel.rename(draftTitle)
                    renameOpen = false
                },
            )
        }
    }

    if (addOpen) {
        val existing = state.rows.map { it.track.id }.toSet()
        val candidates = state.allTracks.filterNot { it.id in existing }
        GlassSheet(
            onDismiss = { addOpen = false },
            title = stringResource(R.string.playlist_add_tracks),
            icon = "addToPlaylist"
        ) {
            if (candidates.isEmpty()) {
                Text(
                    text = stringResource(R.string.playlist_no_more_tracks),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.lg),
                )
            }
            LazyColumn(Modifier.fillMaxWidth()) {
                itemsIndexed(candidates, key = { _, track -> track.id }) { _, track ->
                    GlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = geo.spacing.sm)
                            .clickable { viewModel.addTracks(listOf(track.id)) },
                    ) {
                        Text(
                            text = track.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = tokens.text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }

    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    PejvakIcon("warning", null, tint = tokens.danger, size = geo.icons.md)
                    Text(stringResource(R.string.playlist_delete_title))
                }
            },
            text = { Text(stringResource(R.string.playlist_delete_body)) },
            confirmButton = {
                TextButton(onClick = {
                    deleteOpen = false
                    viewModel.delete()
                }) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { deleteOpen = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
    if (historyOpen) {
        ContextHistorySheet(
            runs = state.runs,
            onDismiss = { historyOpen = false },
            onResume = { viewModel.play() },
            onDelete = viewModel::deleteRun,
        )
    }

}
