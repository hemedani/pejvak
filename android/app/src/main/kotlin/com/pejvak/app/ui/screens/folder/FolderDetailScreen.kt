package com.pejvak.app.ui.screens.folder

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.FolderPlayMode
import com.pejvak.app.domain.describeFolderProgress
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.describeRunOutcome
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.shape
import com.pejvak.app.ui.components.AddToPlaylistSheet
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.WaveProgressBar
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
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
    // Progress and running time only: the run statistics pushed this to two lines on a
    // phone, and a wrapped subtitle reads as a layout fault rather than as detail. They
    // are one tap away in the history sheet.
    val subtitle = buildString {
        append(describeFolderProgress(finishedCount, state.rows.size))
        append(" · ")
        append(formatDuration(state.rows.sumOf { it.track.durationSec }))
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = state.name,
                overline = stringResource(R.string.library_view_folders),
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
                        contentDescription = stringResource(R.string.folder_history),
                        onClick = { historyOpen = true },
                    )
                },
            )
        },
    ) { topInset ->
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = topInset + geo.spacing.sm,
            bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
        ),
    ) {
        val gutter = Modifier.padding(horizontal = geo.spacing.lg)
        item {
            PrimaryButton(
                modifier = gutter,
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
        item { Spacer(Modifier.height(geo.spacing.md)) }
        item {
            // Scrolls instead of wrapping: four chips do not fit a phone's width, and a
            // chip broken over two lines reads as a layout bug, not as a label. The row
            // runs edge to edge so the next chip is visibly waiting off-screen.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                Spacer(Modifier.size(geo.spacing.lg))
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
                Spacer(Modifier.size(geo.spacing.lg))
            }
        }
        item { Spacer(Modifier.height(geo.spacing.xl)) }
        if (state.rows.isEmpty() && !state.loading) {
            item {
                EmptyState(
                    modifier = gutter,
                    icon = "folder",
                    title = stringResource(R.string.folder_empty),
                    body = stringResource(R.string.folder_empty_body),
                )
            }
        }
        items(state.rows, key = { it.track.id }) { row ->
            val index = plan?.queueIds?.indexOf(row.track.id) ?: -1
            FolderTrackCard(
                modifier = gutter,
                row = row,
                onOpen = {
                    if (index >= 0) viewModel.play(index) else onOpenTrack(row.track.id)
                },
                onPlay = { if (index >= 0) viewModel.play(index) else viewModel.play() },
                onOpenAi = onOpenAi,
            )
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
            icon = "history",
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

/**
 * One track inside a folder.
 *
 * A folder is a sequence you work through, so the row has to answer "have I heard this
 * yet?" before you tap it: a finished track states how many times it has been played,
 * a partly-heard one shows the same wave bar as the player with the water it covered,
 * and an untouched one says so plainly. [WaveProgressBar] rather than a plain bar so a
 * readout here looks like the same object the player shows.
 */
@Composable
private fun FolderTrackCard(
    row: FolderTrackRow,
    onOpen: () -> Unit,
    onPlay: () -> Unit,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val progress = row.progress
    val partial = progress != null &&
        !progress.finished &&
        progress.resumeSec > 0 &&
        row.track.durationSec > 0
    val fraction = if (partial) {
        progress.resumeSec.toFloat() / row.track.durationSec.toFloat()
    } else {
        0f
    }
    val playsLabel = when {
        row.playCount <= 0 -> null
        row.playCount == 1 -> stringResource(R.string.library_play_count_one)
        else -> stringResource(R.string.library_play_count, row.playCount)
    }
    val meta = listOfNotNull(
        row.status.label,
        playsLabel,
        formatDuration(row.track.durationSec),
    ).joinToString(" · ")
    val missing = row.status.kind == "missing"

    GlassCard(
        modifier = modifier
            .padding(bottom = geo.spacing.sm)
            .clickable(onClick = onOpen),
    ) {
        Column {
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
                        color = if (missing) tokens.textSecondary else tokens.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                    ) {
                        if (progress?.finished == true) {
                            PejvakIcon(
                                name = "check",
                                contentDescription = null,
                                tint = tokens.accentTeal,
                                size = geo.icons.xs,
                            )
                        }
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                ActionCluster {
                    AiActionButton(onClick = onOpenAi)
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("play"),
                        contentDescription = stringResource(R.string.library_play),
                        onClick = onPlay,
                    )
                }
            }
            if (partial) {
                Spacer(Modifier.height(geo.spacing.sm))
                WaveProgressBar(
                    fraction = fraction,
                    height = 12.dp,
                )
            }
        }
    }
}
