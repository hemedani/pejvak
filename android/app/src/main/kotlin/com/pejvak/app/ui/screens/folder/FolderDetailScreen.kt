package com.pejvak.app.ui.screens.folder

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.FolderPlayMode
import com.pejvak.app.domain.describeContextStats
import com.pejvak.app.domain.describeFolderProgress
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.describeRunOutcome
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.shape
import com.pejvak.app.ui.components.AddToPlaylistSheet
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.ScreenHeader
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun FolderDetailScreen(
    onBack: () -> Unit,
    onOpenTrack: (String) -> Unit,
    onOpenAi: () -> Unit,
    viewModel: FolderDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var historyOpen by remember { mutableStateOf(false) }
    var addOpen by remember { mutableStateOf(false) }

    val plan = state.plan
    val finishedCount = state.rows.count { it.progress?.finished == true }
    val allFinished = state.rows.isNotEmpty() && finishedCount == state.rows.size
    val subtitle = buildString {
        append(describeFolderProgress(finishedCount, state.rows.size))
        append(" · ")
        append(formatDuration(state.rows.sumOf { it.track.durationSec }))
        describeContextStats(state.stats)?.let { append(" · $it") }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = geo.spacing.lg,
            end = geo.spacing.lg,
            top = geo.spacing.xxl,
            bottom = geo.spacing.xxl,
        ),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        item {
            ScreenHeader(
                title = state.name,
                overline = stringResource(R.string.library_view_folders),
                subtitle = subtitle,
                action = {
                    Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("back"),
                            contentDescription = stringResource(R.string.action_back),
                            onClick = onBack,
                        )
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("history"),
                            contentDescription = stringResource(R.string.folder_history),
                            onClick = { historyOpen = true },
                        )
                    }
                },
            )
        }
        item {
            PrimaryButton(
                label = when {
                    state.rows.isEmpty() -> stringResource(R.string.folder_play_folder)
                    allFinished -> stringResource(R.string.folder_play_again)
                    finishedCount == 0 -> stringResource(R.string.folder_play_folder)
                    else -> stringResource(R.string.folder_continue)
                },
                enabled = state.rows.isNotEmpty(),
                onClick = {
                    if (allFinished) viewModel.setMode(FolderPlayMode.Restart)
                    viewModel.play()
                },
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                GlassChip(
                    label = stringResource(R.string.folder_unfinished, state.rows.size - finishedCount),
                    selected = state.mode == FolderPlayMode.Unfinished,
                    onClick = {
                        viewModel.setMode(
                            if (state.mode == FolderPlayMode.Unfinished) FolderPlayMode.Resume
                            else FolderPlayMode.Unfinished,
                        )
                    },
                )
                GlassChip(
                    label = stringResource(R.string.folder_save_playlist),
                    onClick = viewModel::saveAsPlaylist,
                )
                GlassChip(
                    label = stringResource(R.string.folder_add_all_playlist),
                    onClick = { addOpen = true },
                )
                GlassChip(
                    label = stringResource(R.string.folder_add_queue),
                    onClick = viewModel::addAllToQueue,
                )
            }
        }
        if (state.rows.isEmpty() && !state.loading) {
            item {
                EmptyState(
                    icon = "folder",
                    title = stringResource(R.string.folder_empty),
                    body = stringResource(R.string.folder_empty_body),
                )
            }
        }
        items(state.rows, key = { it.track.id }) { row ->
            val index = plan?.queueIds?.indexOf(row.track.id) ?: -1
            GlassCard(
                modifier = Modifier.clickable {
                    if (index >= 0) viewModel.play(index) else onOpenTrack(row.track.id)
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
                            text = "${row.status.label} · ${formatDuration(row.track.durationSec)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.textSecondary,
                        )
                    }
                    AiActionButton(onClick = onOpenAi)
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("play"),
                        contentDescription = stringResource(R.string.library_play),
                        onClick = { if (index >= 0) viewModel.play(index) else viewModel.play() },
                    )
                }
            }
        }
    }

    if (addOpen) {
        AddToPlaylistSheet(
            playlists = state.playlists,
            onDismiss = { addOpen = false },
            onPick = {
                viewModel.addAllToPlaylist(it)
                addOpen = false
            },
            onCreate = {
                viewModel.createPlaylistWithAll(it)
                addOpen = false
            },
        )
    }

    if (historyOpen) {
        GlassSheet(
            onDismiss = { historyOpen = false },
            title = stringResource(R.string.folder_history),
        ) {
            if (state.runs.isEmpty()) {
                Text(
                    text = stringResource(R.string.folder_no_history),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.lg),
                )
            }
            state.runs.forEach { run ->
                val outcome = describeRunOutcome(run.shape())
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = geo.spacing.sm)
                        .clickable {
                            viewModel.play()
                            historyOpen = false
                        },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = describeRecentWhen(run.startedAt),
                                style = MaterialTheme.typography.titleSmall,
                                color = tokens.text,
                            )
                            Text(
                                text = outcome.label,
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.textSecondary,
                            )
                        }
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("delete"),
                            contentDescription = stringResource(R.string.library_playlist_delete_action),
                            onClick = { viewModel.deleteRun(run) },
                        )
                    }
                }
            }
            Spacer(Modifier.size(geo.spacing.xl))
        }
    }
}
