package com.pejvak.app.ui.screens.track

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.annotationsToMarkdown
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatDayOfWeek
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.DetailRow
import com.pejvak.app.ui.components.DetailSection
import com.pejvak.app.ui.components.MetaChip
import com.pejvak.app.ui.components.StatTile
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
                verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
            ) {
                if (track == null && !state.loading) {
                    item {
                        EmptyState(
                            icon = "music",
                            title = stringResource(R.string.track_detail_not_found),
                            body = stringResource(R.string.track_detail_not_found_body),
                        )
                    }
                }
                if (track != null) {
                    val stats = state.stats
                    val summary = state.summary
                    val info = state.inspection?.info
                    val hasHistory = (stats?.playCount ?: 0) > 0 ||
                            (summary?.openCount ?: 0) > 0 ||
                            (stats?.totalListenTimeSec ?: 0) > 0
                    var order = 0

                    // Hero artwork.
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .oceanEntrance(order++, swayDp = 0.dp),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            HeroArtwork(
                                size = geo.tiles.xl * 2 + 12.dp,
                                contentHash = track.contentHash,
                                title = track.title,
                                artworkUrl = track.artworkUrl,
                            )
                        }
                    }

                    // Meta chips — only the ones that have a value (no empty chips).
                    item {
                        val originLabel = when {
                            track.origin == Origin.Online -> stringResource(R.string.track_detail_stream)
                            track.isAudiobook -> stringResource(R.string.track_detail_audiobook)
                            else -> stringResource(R.string.track_detail_track)
                        }
                        val formatLabel = info?.container ?: track.mimeType?.substringAfterLast('/')
                        FlowRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .oceanEntrance(order++, swayDp = 0.dp),
                            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                            verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                        ) {
                            MetaChip(icon = "duration", text = if (track.durationSec > 0) formatClock(track.durationSec) else null)
                            MetaChip(icon = "music", text = formatLabel)
                            MetaChip(icon = "library", text = originLabel)
                        }
                    }

                    if (track.origin == Origin.Online) {
                        item {
                            InlineNotice(
                                tone = NoticeTone.Info,
                                title = stringResource(R.string.track_detail_stream),
                                message = stringResource(R.string.track_detail_stream_body),
                                modifier = Modifier.oceanEntrance(order++, swayDp = 0.dp),
                            )
                        }
                    }
                    if (track.availability == Availability.Missing) {
                        item {
                            InlineNotice(
                                tone = NoticeTone.Danger,
                                title = stringResource(R.string.track_detail_missing),
                                message = stringResource(R.string.track_detail_missing_body),
                                modifier = Modifier.oceanEntrance(order++, swayDp = 0.dp),
                            )
                        }
                    }

                    item {
                        PrimaryButton(
                            label = if (track.availability == Availability.Missing) {
                                stringResource(R.string.track_detail_file_missing)
                            } else {
                                stringResource(R.string.library_play)
                            },
                            enabled = track.availability != Availability.Missing,
                            onClick = { viewModel.play() },
                            modifier = Modifier.oceanEntrance(order++, swayDp = 0.dp),
                        )
                    }

                    // Listening summary: a grid of meaningful tiles, or one empty state.
                    if (hasHistory && stats != null) {
                        item {
                            DetailSection(
                                title = stringResource(R.string.track_detail_listening),
                                icon = "history",
                                modifier = Modifier.oceanEntrance(order++),
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    StatTile(
                                        label = stringResource(R.string.track_detail_sessions),
                                        value = stats.playCount.toString(),
                                        modifier = Modifier.weight(1f),
                                    )
                                    StatTile(
                                        label = stringResource(R.string.track_detail_listened),
                                        value = formatDuration(stats.totalListenTimeSec),
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    StatTile(
                                        label = stringResource(R.string.track_detail_completion),
                                        value = "${(stats.completionRate * 100).toInt()}%",
                                        modifier = Modifier.weight(1f),
                                    )
                                    StatTile(
                                        label = stringResource(R.string.track_detail_last_played),
                                        value = stats.lastPlayedAt?.let { describeRecentWhen(it) }
                                            ?: stringResource(R.string.library_not_played),
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                // Deeper stats only when there is something to say.
                                val days = summary?.daysListened ?: 0
                                val avg = summary?.averageSec ?: 0
                                val longest = summary?.longestSec ?: 0
                                val notes = stats.annotationCount
                                if (days > 0 || avg > 0 || longest > 0 || notes > 0) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                        if (days > 0) {
                                            StatTile(
                                                label = stringResource(R.string.track_detail_days),
                                                value = days.toString(),
                                                modifier = Modifier.weight(1f),
                                            )
                                        }
                                        if (avg > 0) {
                                            StatTile(
                                                label = stringResource(R.string.track_detail_average),
                                                value = formatDuration(avg),
                                                modifier = Modifier.weight(1f),
                                            )
                                        }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                        if (longest > 0) {
                                            StatTile(
                                                label = stringResource(R.string.track_detail_longest),
                                                value = formatDuration(longest),
                                                modifier = Modifier.weight(1f),
                                            )
                                        }
                                        if (notes > 0) {
                                            StatTile(
                                                label = stringResource(R.string.track_detail_notes_count),
                                                value = notes.toString(),
                                                modifier = Modifier.weight(1f),
                                            )
                                        }
                                    }
                                }
                                // First / last / speeds as compact detail rows (blank → hidden).
                                summary?.firstStartedAt?.let {
                                    DetailRow(
                                        label = stringResource(R.string.track_detail_first_listen),
                                        value = formatDayOfWeek(it),
                                        icon = "calendar",
                                    )
                                }
                                val speeds = summary?.speeds?.map { formatSpeed(it) }?.distinct()
                                DetailRow(
                                    label = stringResource(R.string.track_detail_speeds),
                                    value = speeds?.takeIf { it.isNotEmpty() }?.joinToString(", "),
                                    icon = "speed",
                                )
                            }
                        }
                    } else {
                        item {
                            GlassCard(
                                Modifier
                                    .fillMaxWidth()
                                    .oceanEntrance(order++, swayDp = 0.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(geo.controls.sm)
                                            .clip(CircleShape)
                                            .background(tokens.glassFill),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        PejvakIcon("history", null, tint = tokens.textSecondary, size = geo.icons.sm)
                                    }
                                    Text(
                                        text = stringResource(R.string.track_detail_not_listened),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = tokens.textSecondary,
                                    )
                                }
                            }
                        }
                    }

                    // Audio facts — the section renders only if at least one is present.
                    val audio = info
                    if (audio != null) {
                        val hasAudio = audio.container != null || audio.codec != null ||
                            audio.bitrateKbps != null || audio.sampleRateHz != null ||
                            audio.channels != null || audio.channelMode != null ||
                            audio.bitsPerSample != null || audio.durationSec != null
                        if (hasAudio) {
                            item {
                                DetailSection(
                                    title = stringResource(R.string.track_detail_audio),
                                    icon = "equalizer",
                                    modifier = Modifier.oceanEntrance(order++),
                                ) {
                                    val audioRows = listOfNotNull(
                                        audio.container?.let { stringResource(R.string.track_detail_container) to it },
                                        audio.codec?.let { stringResource(R.string.track_detail_codec) to it },
                                        audio.bitrateKbps?.let {
                                            stringResource(R.string.track_detail_bitrate) to
                                                "$it kbps" + if (audio.variableBitrate) " (${stringResource(R.string.track_detail_vbr)})" else ""
                                        },
                                        audio.sampleRateHz?.let { stringResource(R.string.track_detail_sample_rate) to "$it Hz" },
                                        run {
                                            val ch = audio.channels
                                            val mode = audio.channelMode
                                            when {
                                                ch != null && mode != null -> stringResource(R.string.track_detail_channels) to "$ch · $mode"
                                                ch != null -> stringResource(R.string.track_detail_channels) to ch.toString()
                                                mode != null -> stringResource(R.string.track_detail_channels) to mode
                                                else -> null
                                            }
                                        },
                                        audio.bitsPerSample?.let { stringResource(R.string.track_detail_bit_depth) to "$it-bit" },
                                        audio.durationSec?.let { stringResource(R.string.track_detail_duration) to formatClock(it.toInt()) },
                                    )
                                    audioRows.forEach { (label, value) -> DetailRow(label, value) }
                                }
                            }
                        }
                    }

                    // Metadata / tags — always has at least the "Added" line.
                    item {
                        DetailSection(
                            title = stringResource(R.string.track_detail_details),
                            icon = "info",
                            modifier = Modifier.oceanEntrance(order++),
                        ) {
                            val detailRows = listOfNotNull(
                                track.author?.let { stringResource(R.string.track_detail_author) to it },
                                track.narrator?.let { stringResource(R.string.track_detail_narrator) to it },
                                track.album?.let { stringResource(R.string.track_detail_album) to it },
                                track.year?.let { stringResource(R.string.track_detail_year) to it.toString() },
                                track.trackNumber?.let { stringResource(R.string.track_detail_track_no) to it.toString() },
                                track.discNumber?.let { stringResource(R.string.track_detail_disc_no) to it.toString() },
                                track.folderName?.let { stringResource(R.string.track_detail_folder) to it },
                                track.collectionTitle?.let { stringResource(R.string.track_detail_collection) to it },
                                track.mimeType?.let { stringResource(R.string.track_detail_format) to it },
                                stringResource(R.string.track_detail_added) to formatDayOfWeek(track.createdAt),
                            )
                            detailRows.forEach { (label, value) -> DetailRow(label, value) }
                        }
                    }

                    // File — hidden for pure streams with no on-device file.
                    val hasFile = track.fileName != null || track.sourcePath != null ||
                        track.folderKey != null || track.fileSizeBytes > 0 || track.downloadPath != null
                    if (hasFile) {
                        item {
                            DetailSection(
                                title = stringResource(R.string.track_detail_file),
                                icon = "folder",
                                modifier = Modifier.oceanEntrance(order++),
                            ) {
                                val fileRows = listOfNotNull(
                                    track.fileName?.let { stringResource(R.string.track_detail_file_name) to it },
                                    (track.sourcePath ?: track.folderKey)?.let { stringResource(R.string.track_detail_path) to it },
                                    if (track.fileSizeBytes > 0) stringResource(R.string.track_detail_size) to formatBytes(track.fileSizeBytes) else null,
                                    track.downloadPath?.let { stringResource(R.string.track_detail_downloaded) to it },
                                )
                                fileRows.forEach { (label, value) -> DetailRow(label, value) }
                            }
                        }
                    }

                    // Recent sessions — shown only when there are any.
                    if (state.sessions.isNotEmpty()) {
                        val shown = state.sessions.take(12)
                        item {
                            DetailSection(
                                title = stringResource(R.string.track_detail_sessions_title),
                                icon = "history",
                                modifier = Modifier.oceanEntrance(order++),
                            ) {
                                shown.forEach { session -> SessionRow(session) }
                                if (state.sessions.size > shown.size) {
                                    Text(
                                        text = stringResource(R.string.track_detail_more_sessions, state.sessions.size - shown.size),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = tokens.textTertiary,
                                    )
                                }
                            }
                        }
                    }

                    // Notes — shown only when there are any.
                    if (state.annotations.isNotEmpty()) {
                        item {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .oceanEntrance(order++, swayDp = 0.dp),
                            ) {
                                Text(
                                    text = stringResource(R.string.track_detail_notes_title).uppercase(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textSecondary,
                                )
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
                        itemsIndexed(state.annotations, key = { _, note -> note.id }) { idx, note ->
                            AnnotationRow(
                                note = note,
                                onPlay = { viewModel.play(note.positionSec) },
                                modifier = Modifier.oceanEntrance(order + idx),
                            )
                        }
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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(geo.tiles.sm)
                                .clip(CircleShape)
                                .background(tokens.accentTeal.copy(alpha = 0.16f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            PejvakIcon(
                                name = "playlist",
                                contentDescription = null,
                                tint = tokens.accentTeal,
                                size = geo.icons.sm,
                            )
                        }
                        Text(playlist.title, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                    }
                }
            }
            Spacer(Modifier.size(geo.spacing.xl))
        }
    }
}

@Composable
private fun SessionRow(session: Session) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .padding(vertical = geo.spacing.xxs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.sm)
                .clip(CircleShape)
                .background(tokens.glassFill),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon("time", null, tint = tokens.textSecondary, size = geo.icons.sm)
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = describeRecentWhen(session.startedAt),
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${formatDuration(session.durationListenedSec)} · ${sessionOutcome(session)}",
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
        }
        Text(
            text = formatClock(session.endPositionSec ?: session.startPositionSec),
            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
            color = tokens.textSecondary,
        )
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
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onPlay)
            .padding(vertical = geo.spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.sm)
                .clip(CircleShape)
                .background(tokens.glassFill),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon("note", null, tint = tokens.textSecondary, size = geo.icons.sm)
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = note.text,
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
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
            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
            color = tokens.textSecondary,
        )
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return ""
    val mb = bytes / (1024.0 * 1024.0)
    return if (mb >= 1) String.format("%.1f MB", mb) else "${bytes / 1024} KB"
}
