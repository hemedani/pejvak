package com.pejvak.app.ui.screens.track

import android.content.Intent
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.annotationsToMarkdown
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.player.HeroArtwork
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

@Composable
fun TrackDetailScreen(
    onBack: () -> Unit,
    viewModel: TrackDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val context = LocalContext.current
    var addSheet by remember { mutableStateOf(false) }

    val track = state.track
    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = track?.title ?: stringResource(R.string.track_detail_not_found),
                overline = track?.let {
                    if (it.isAudiobook) stringResource(R.string.track_detail_audiobook)
                    else stringResource(R.string.track_detail_track)
                },
                subtitle = track?.author,
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                actions = {
                    if (track != null) {
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("add"),
                            contentDescription = stringResource(R.string.track_detail_add_playlist),
                            onClick = { addSheet = true },
                        )
                    }
                },
            )
        },
    ) { topInset ->
        OceanCascade(key = track != null) {
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
                if (track == null && !state.loading) {
                    item {
                        EmptyState(
                            icon = "music",
                            title = stringResource(R.string.track_detail_not_found),
                            body = stringResource(R.string.track_detail_not_found_body),
                            modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                        )
                    }
                }
                if (track != null) {
                    var order = 0
                    val heroIdx = order++
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .oceanEntrance(heroIdx, swayDp = 0.dp),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            HeroArtwork(
                                size = geo.tiles.xl * 2,
                                contentHash = track.contentHash,
                                title = track.title,
                                artworkUrl = track.artworkUrl,
                            )
                        }
                    }
                    if (track.origin == Origin.Online) {
                        val idx = order++
                        item {
                            InlineNotice(
                                tone = NoticeTone.Info,
                                title = stringResource(R.string.track_detail_stream),
                                message = stringResource(R.string.track_detail_stream_body),
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    if (track.availability == Availability.Missing) {
                        val idx = order++
                        item {
                            InlineNotice(
                                tone = NoticeTone.Danger,
                                title = stringResource(R.string.track_detail_missing),
                                message = stringResource(R.string.track_detail_missing_body),
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    val playIdx = order++
                    item {
                        PrimaryButton(
                            label = if (track.availability == Availability.Missing) {
                                stringResource(R.string.track_detail_file_missing)
                            } else {
                                stringResource(R.string.library_play)
                            },
                            enabled = track.availability != Availability.Missing,
                            onClick = { viewModel.play() },
                            modifier = Modifier.oceanEntrance(playIdx, swayDp = 0.dp),
                        )
                    }
                    val statRow1Idx = order++
                    item {
                        Row(
                            modifier = Modifier.oceanEntrance(statRow1Idx),
                            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                        ) {
                            StatCell(
                                label = stringResource(R.string.track_detail_sessions),
                                value = state.stats?.playCount?.toString() ?: "0",
                                modifier = Modifier.weight(1f),
                            )
                            StatCell(
                                label = stringResource(R.string.track_detail_completion),
                                value = "${((state.stats?.completionRate ?: 0.0) * 100).toInt()}%",
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                    val statRow2Idx = order++
                    item {
                        Row(
                            modifier = Modifier.oceanEntrance(statRow2Idx),
                            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                        ) {
                            StatCell(
                                label = stringResource(R.string.track_detail_listened),
                                value = formatDuration(state.stats?.totalListenTimeSec ?: 0),
                                modifier = Modifier.weight(1f),
                            )
                            StatCell(
                                label = stringResource(R.string.track_detail_last_played),
                                value = state.stats?.lastPlayedAt?.let { describeRecentWhen(it) }
                                    ?: stringResource(R.string.library_not_played),
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                    val audioIdx = order++
                    item {
                        FactSection(
                            title = stringResource(R.string.track_detail_audio),
                            modifier = Modifier.oceanEntrance(audioIdx),
                        ) {
                            state.inspection?.info?.let { info ->
                                FactRow(stringResource(R.string.track_detail_container), info.container)
                                FactRow(stringResource(R.string.track_detail_codec), info.codec)
                                FactRow(
                                    stringResource(R.string.track_detail_bitrate),
                                    info.bitrateKbps?.let { "$it kbps" },
                                )
                                FactRow(
                                    stringResource(R.string.track_detail_sample_rate),
                                    info.sampleRateHz?.let { "$it Hz" },
                                )
                                FactRow(
                                    stringResource(R.string.track_detail_channels),
                                    info.channels?.toString(),
                                )
                            }
                            if (state.inspection == null) {
                                Text(
                                    text = if (track.origin == Origin.Online) {
                                        stringResource(R.string.track_detail_stream)
                                    } else {
                                        stringResource(R.string.track_detail_audio_unknown)
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.textSecondary,
                                )
                            }
                        }
                    }
                    val tagsIdx = order++
                    item {
                        FactSection(
                            title = stringResource(R.string.track_detail_tags),
                            modifier = Modifier.oceanEntrance(tagsIdx),
                        ) {
                            FactRow(stringResource(R.string.track_detail_author), track.author)
                            FactRow(stringResource(R.string.track_detail_narrator), track.narrator)
                            FactRow(stringResource(R.string.track_detail_album), track.album)
                            FactRow(stringResource(R.string.track_detail_year), track.year?.toString())
                        }
                    }
                    val fileIdx = order++
                    item {
                        FactSection(
                            title = stringResource(R.string.track_detail_file),
                            modifier = Modifier.oceanEntrance(fileIdx),
                        ) {
                            FactRow(stringResource(R.string.track_detail_file_name), track.fileName)
                            FactRow(stringResource(R.string.track_detail_path), track.sourcePath ?: track.folderKey)
                            FactRow(stringResource(R.string.track_detail_size), formatBytes(track.fileSizeBytes))
                        }
                    }
                    val sessHdrIdx = order++
                    item {
                        SectionTitle(
                            text = stringResource(R.string.track_detail_sessions_title),
                            modifier = Modifier.oceanEntrance(sessHdrIdx, swayDp = 0.dp, riseDp = 8.dp),
                        )
                    }
                    if (state.sessions.isEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.track_detail_no_sessions),
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.textSecondary,
                            )
                        }
                    }
                    val visibleSessions = state.sessions.take(12)
                    val sessBase = order
                    order += visibleSessions.size
                    itemsIndexed(visibleSessions, key = { _, session -> session.id }) { idx, session ->
                        SessionRow(session, modifier = Modifier.oceanEntrance(sessBase + idx))
                    }
                    val noteHdrIdx = order++
                    item {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier
                                .fillMaxWidth()
                                .oceanEntrance(noteHdrIdx, swayDp = 0.dp, riseDp = 8.dp),
                        ) {
                            SectionTitle(stringResource(R.string.track_detail_notes_title))
                            if (state.annotations.isNotEmpty()) {
                                BubbleButton(
                                    icon = ICON_GLYPHS.getValue("share"),
                                    contentDescription = stringResource(R.string.note_detail_share),
                                    onClick = {
                                        val markdown = annotationsToMarkdown(track, state.annotations)
                                        val send = Intent(Intent.ACTION_SEND).apply {
                                            type = "text/plain"
                                            putExtra(Intent.EXTRA_SUBJECT, track.title)
                                            putExtra(Intent.EXTRA_TEXT, markdown)
                                        }
                                        context.startActivity(Intent.createChooser(send, track.title))
                                    },
                                )
                            }
                        }
                    }
                    if (state.annotations.isEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.track_detail_no_notes),
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.textSecondary,
                            )
                        }
                    }
                    val noteBase = order
                    itemsIndexed(state.annotations, key = { _, note -> note.id }) { idx, note ->
                        AnnotationRow(
                            note = note,
                            onPlay = { viewModel.play(note.positionSec) },
                            modifier = Modifier.oceanEntrance(noteBase + idx),
                        )
                    }
                }
            }
        }
    }

    if (addSheet) {
        GlassSheet(
            onDismiss = { addSheet = false },
            title = stringResource(R.string.track_detail_add_playlist),
            icon = "addToPlaylist",
        ) {
            if (state.playlists.isEmpty()) {
                Text(
                    text = stringResource(R.string.track_detail_no_playlists),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.lg),
                )
            }
            state.playlists.forEach { playlist ->
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = geo.spacing.sm)
                        .clickable {
                            viewModel.addToPlaylist(playlist.id)
                            addSheet = false
                        },
                ) {
                    Text(playlist.title, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                }
            }
            Spacer(Modifier.size(geo.spacing.xl))
        }
    }
}

@Composable
private fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = tokens.textSecondary,
        modifier = modifier,
    )
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    GlassCard(modifier = modifier) {
        Column {
            Text(value, style = MaterialTheme.typography.titleLarge, color = tokens.text)
            Text(label, style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
        }
    }
}

@Composable
private fun FactSection(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.sm),
    ) {
        SectionTitle(title)
        GlassCard { Column(verticalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.xs)) { content() } }
    }
}

@Composable
private fun FactRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    val tokens = LocalPejvakTokens.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.md)) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = tokens.text,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(2f),
        )
    }
}

@Composable
private fun SessionRow(session: Session, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    GlassCard(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = describeRecentWhen(session.startedAt),
                    style = MaterialTheme.typography.titleSmall,
                    color = tokens.text,
                )
                Text(
                    text = "${formatDuration(session.durationListenedSec)} · ${sessionOutcome(session)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            Text(
                text = formatClock(session.endPositionSec ?: session.startPositionSec),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun sessionOutcome(session: Session): String = when {
    session.completed -> stringResource(R.string.track_detail_finished)
    session.endedAt == null -> stringResource(R.string.track_detail_open)
    else -> stringResource(R.string.track_detail_interrupted)
}

@Composable
private fun AnnotationRow(
    note: Annotation,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    GlassCard(modifier = modifier.clickable(onClick = onPlay)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(note.text, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
                if (note.tags.isNotEmpty()) {
                    Text(
                        text = note.tags.joinToString(" ") { "#$it" },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textTertiary,
                    )
                }
            }
            Text(
                text = formatClock(note.positionSec),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
            )
        }
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "—"
    val mb = bytes / (1024.0 * 1024.0)
    return if (mb >= 1) String.format("%.1f MB", mb) else "${bytes / 1024} KB"
}
