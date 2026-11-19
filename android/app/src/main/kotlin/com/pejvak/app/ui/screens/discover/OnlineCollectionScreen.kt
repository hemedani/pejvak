package com.pejvak.app.ui.screens.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.online.SeriesSection
import com.pejvak.app.domain.online.buildSeriesSections
import com.pejvak.app.domain.online.describeKnownTrackCount
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.DownloadControl
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.row.RowAction
import com.pejvak.app.ui.components.row.RowActions
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun OnlineCollectionScreen(
    onBack: () -> Unit,
    onOpenAi: () -> Unit,
    viewModel: OnlineCollectionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val uriHandler = LocalUriHandler.current
    val resumable = state.tracks.firstOrNull { it.progressRatio > 0.01 }
    val playIndex = state.tracks.indexOfFirst { it.track.id == resumable?.track?.id }.coerceAtLeast(0)
    val sections = remember(state.tracks) { buildSeriesSections(state.tracks) { it.track.title } }
    var confirmDelete by remember { mutableStateOf(false) }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = state.title,
                overline = state.sourceName,
                subtitle = listOfNotNull(
                    describeKnownTrackCount(state.trackCount),
                    state.tracks.sumOf { it.track.durationSec }.takeIf { it > 0 }?.let { formatDuration(it) },
                ).joinToString(" · ").ifBlank { null },
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
            )
        },
    ) { topInset ->
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
        if (state.stale) {
            item {
                InlineNotice(
                    message = stringResource(R.string.discover_stale_body),
                    title = stringResource(R.string.discover_stale),
                    tone = NoticeTone.Warning,
                    retryLabel = stringResource(R.string.action_retry),
                    onRetry = { viewModel.load(refresh = true) },
                )
            }
        }
        if (state.offline) {
            item {
                InlineNotice(
                    message = state.error ?: stringResource(R.string.discover_offline_body),
                    title = stringResource(R.string.discover_offline),
                    tone = NoticeTone.Warning,
                    retryLabel = stringResource(R.string.action_retry),
                    onRetry = { viewModel.load(refresh = true) },
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                PrimaryButton(
                    label = stringResource(if (resumable != null) R.string.discover_continue else R.string.discover_play),
                    enabled = state.tracks.isNotEmpty(),
                    onClick = { viewModel.play(playIndex, resumable?.positionSec ?: 0) },
                    modifier = Modifier.weight(1f),
                )
                GlassChip(
                    label = if (state.saved?.isFavorite == true) stringResource(R.string.discover_favorited)
                    else stringResource(R.string.discover_favorite),
                    icon = "favorite",
                    onClick = viewModel::toggleFavorite,
                )
            }
        }
        item {
            DownloadControl(
                summary = state.download,
                onStart = viewModel::startDownload,
                onCancel = viewModel::cancelDownload,
                onRetry = viewModel::retryDownload,
                onDelete = { confirmDelete = true },
                busy = state.downloadBusy,
            )
        }
        state.downloadError?.let { message ->
            item { InlineNotice(message = message, tone = NoticeTone.Danger) }
        }
        if (state.pageUrl != null) {
            item {
                GlassChip(
                    label = stringResource(R.string.discover_open_page),
                    icon = "share",
                    onClick = { state.pageUrl?.let { uriHandler.openUri(it) } },
                )
            }
        }
        if (state.tracks.isEmpty() && !state.loading) {
            item {
                EmptyState(
                    icon = "play",
                    title = stringResource(R.string.discover_empty_collection),
                    body = stringResource(R.string.discover_empty_collection_body),
                )
            }
        }
        if (state.tracks.isNotEmpty() && sections.size == 1 && sections[0].standalone) {
            item {
                ListGroup(items = state.tracks) { row, _ ->
                    OnlineTrackRowView(
                        row = row,
                        playing = state.playingTrackId == row.track.id,
                        onClick = { viewModel.playTrack(row.track.id) },
                        onOpenAi = onOpenAi,
                    )
                }
            }
        } else {
            sections.forEach { section ->
                item {
                    SeriesHeader(
                        section = section,
                        onDownload = {
                            viewModel.downloadSeries(
                                section.title,
                                section.key,
                                section.tracks.map { it.track.id },
                            )
                        },
                    )
                }
                item {
                    ListGroup(items = section.tracks) { row, _ ->
                        OnlineTrackRowView(
                            row = row,
                            playing = state.playingTrackId == row.track.id,
                            onClick = { viewModel.playTrack(row.track.id) },
                            onOpenAi = onOpenAi,
                        )
                    }
                }
            }
        }
        if (state.loading) {
            item {
                Text(
                    text = stringResource(R.string.discover_loading),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.md),
                )
            }
        }
    }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.download_delete_title)) },
            text = { Text(stringResource(R.string.download_delete_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    viewModel.deleteDownload()
                }) { Text(stringResource(R.string.download_delete_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun SeriesHeader(section: SeriesSection<OnlineTrackRow>, onDownload: () -> Unit) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = geo.spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        Column(Modifier.weight(1f)) {
            Text(section.title, style = MaterialTheme.typography.titleMedium, color = tokens.text)
            Text(
                text = stringResource(R.string.download_section_count, section.tracks.size),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
        }
        GlassChip(label = stringResource(R.string.download_series), icon = "download", onClick = onDownload)
    }
}

@Composable
private fun OnlineTrackRowView(
    row: OnlineTrackRow,
    playing: Boolean,
    onClick: () -> Unit,
    onOpenAi: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    ListRow(
        title = row.track.title,
        subtitle = row.track.author,
        meta = buildString {
            append(formatClock(row.track.durationSec))
            if (row.positionSec > 0) append(" · ").append(stringResource(R.string.discover_resume_at, formatClock(row.positionSec)))
        },
        status = if (row.progressRatio > 0.01) {
            com.pejvak.app.ui.components.row.StatusSpec(
                kind = "streaming",
                label = stringResource(R.string.discover_progress, (row.progressRatio * 100).toInt()),
                tone = com.pejvak.app.ui.components.row.StatusTone.Positive,
            )
        } else null,
        leading = {
            PaletteTile(
                contentHash = row.track.contentHash,
                label = row.track.title,
                artworkUrl = row.track.artworkUrl,
                size = geo.tiles.md,
            )
        },
        actions = listOf(
            RowActions.ai(onOpenAi),
            RowAction(
                id = "play",
                icon = "play",
                label = stringResource(if (playing) R.string.discover_playing else R.string.discover_play),
                priority = 0,
                onClick = onClick,
            ),
        ),
        onClick = onClick,
    )
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = geo.spacing.lg)
            .height(2.dp)
            .clip(RoundedCornerShape(geo.radius.pill))
            .background(tokens.glassBorder),
    ) {
        Box(
            Modifier
                .fillMaxWidth(row.progressRatio.toFloat())
                .height(2.dp)
                .clip(RoundedCornerShape(geo.radius.pill))
                .background(tokens.accentTeal),
        )
    }
}
