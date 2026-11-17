package com.pejvak.app.ui.screens.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.FolderSummary
import com.pejvak.app.domain.PlaylistSummary
import com.pejvak.app.domain.RecentPlay
import com.pejvak.app.domain.SMART_RULES
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.describeFolderProgress
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.folderProgressRatio
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.ScreenHeader
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.field.SearchField
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

private val LANGUAGE_OPTIONS = listOf(
    "en" to "English",
    "fa" to "فارسی",
    "ar" to "العربية",
    "fr" to "Français",
)

@Composable
fun LibraryScreen(
    onOpenSettings: () -> Unit,
    onOpenMissing: () -> Unit,
    onImport: () -> Unit,
    onOpenTrack: (String) -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit,
    onOpenSmart: (String) -> Unit,
    onOpenAi: () -> Unit,
    onOpenSource: (String) -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    LaunchedEffect(listState.isScrollInProgress, state.loading) {
        if (!listState.isScrollInProgress && !state.loading) viewModel.backfillArtwork()
    }
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    var showLanguage by rememberSaveable { mutableStateOf(false) }
    var languageAsked by rememberSaveable { mutableStateOf(false) }
    var newPlaylist by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<PlaylistSummary?>(null) }

    LaunchedEffect(state.loading, state.languageCode) {
        if (!state.loading && state.languageCode == null && !languageAsked) {
            languageAsked = true
            showLanguage = true
        }
    }

    LazyColumn(
        state = listState,
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
                title = stringResource(R.string.library_title),
                overline = stringResource(R.string.library_overline),
                action = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("settings"),
                        contentDescription = stringResource(R.string.settings_title),
                        onClick = onOpenSettings,
                    )
                },
            )
        }
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassChip(
                    label = state.languageCode?.let { code ->
                        LANGUAGE_OPTIONS.firstOrNull { it.first == code }?.second ?: code
                    } ?: stringResource(R.string.library_language_choose),
                    icon = "language",
                    onClick = { showLanguage = true },
                )
            }
        }
        item {
            SearchField(
                value = state.query,
                onValueChange = viewModel::setQuery,
                placeholder = stringResource(R.string.library_search_placeholder),
            )
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                val views = if (state.languageCode != null) {
                    listOf(LibraryView.Online) + listOf(
                        LibraryView.Tracks,
                        LibraryView.Folders,
                        LibraryView.Playlists,
                        LibraryView.Recent,
                    )
                } else {
                    listOf(
                        LibraryView.Tracks,
                        LibraryView.Folders,
                        LibraryView.Playlists,
                        LibraryView.Recent,
                    )
                }
                items(views) { view ->
                    val count = state.counts[view]
                    GlassChip(
                        label = viewLabel(view),
                        selected = state.view == view,
                        icon = viewIcon(view),
                        count = if (state.query.isNotEmpty() && count != null) count else null,
                        onClick = { viewModel.setView(view) },
                    )
                }
            }
        }
        if (state.view == LibraryView.Tracks && state.hasBothOrigins) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    GlassChip(
                        label = stringResource(R.string.library_origin_local),
                        selected = state.origin == TrackOriginTab.Local,
                        count = state.localCount,
                        onClick = { viewModel.setOrigin(TrackOriginTab.Local) },
                    )
                    GlassChip(
                        label = stringResource(R.string.library_origin_online),
                        selected = state.origin == TrackOriginTab.Online,
                        count = state.onlineCount,
                        onClick = { viewModel.setOrigin(TrackOriginTab.Online) },
                    )
                }
            }
        }
        if (state.spotlight != null && state.query.isEmpty() && state.view != LibraryView.Online) {
            item {
                SpotlightCard(state.spotlight!!) { card ->
                    viewModel.playTrack(card.track, state.tracks.map { it.track })
                }
            }
        }
        if (state.missingCount > 0) {
            item {
                GlassCard(modifier = Modifier.clickable(onClick = onOpenMissing)) {
                    InlineNotice(
                        tone = NoticeTone.Danger,
                        title = stringResource(R.string.library_missing_title),
                        message = stringResource(R.string.library_missing_body),
                    )
                }
            }
        }
        if (state.elsewhere != null) {
            item {
                Text(
                    text = state.elsewhere!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
        }

        when (state.view) {
            LibraryView.Online -> {
                if (state.sources.isEmpty()) {
                    item {
                        EmptyState(
                            icon = "language",
                            title = stringResource(R.string.discover_no_sources),
                            body = stringResource(R.string.discover_no_sources_body),
                        )
                    }
                } else {
                    item {
                        Text(
                            text = stringResource(R.string.discover_sources_here),
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.textSecondary,
                        )
                    }
                    item {
                        ListGroup(items = state.sources) { source, _ ->
                            SourceShelfRow(source = source, onClick = { onOpenSource(source.id) })
                        }
                    }
                }
            }
            LibraryView.Tracks -> {
                if (state.tracks.isEmpty() && !state.loading) {
                    item {
                        EmptyState(
                            icon = "music",
                            title = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_tracks)
                            } else {
                                stringResource(R.string.library_no_match)
                            },
                            body = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_tracks_body)
                            } else {
                                stringResource(R.string.library_no_match_body, state.query)
                            },
                        )
                    }
                }
                items(state.tracks, key = { it.track.id }) { card ->
                    TrackRow(card, onOpenAi = onOpenAi) {
                        onOpenTrack(card.track.id)
                    }
                }
            }
            LibraryView.Folders -> {
                if (state.folders.isEmpty() && !state.loading) {
                    item {
                        EmptyState(
                            icon = "folder",
                            title = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_folders)
                            } else {
                                stringResource(R.string.library_no_match)
                            },
                            body = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_folders_body)
                            } else {
                                stringResource(R.string.library_no_match_body, state.query)
                            },
                        )
                    }
                }
                items(state.folders, key = { it.folder.key }) { summary ->
                    FolderRow(summary, onOpenAi = onOpenAi) { onOpenFolder(summary.folder.key) }
                }
            }
            LibraryView.Playlists -> {
                item {
                    GlassCard {
                        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                            Text(
                                text = stringResource(R.string.library_playlist_new),
                                style = MaterialTheme.typography.titleMedium,
                                color = tokens.text,
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                TextField(
                                    value = newPlaylist,
                                    onValueChange = { newPlaylist = it },
                                    modifier = Modifier.weight(1f),
                                    placeholder = stringResource(R.string.library_playlist_name),
                                )
                                BubbleButton(
                                    icon = ICON_GLYPHS.getValue("add"),
                                    contentDescription = stringResource(R.string.library_playlist_create),
                                    onClick = {
                                        viewModel.createPlaylist(newPlaylist)
                                        newPlaylist = ""
                                    },
                                    enabled = newPlaylist.isNotBlank(),
                                )
                            }
                        }
                    }
                }
                item {
                    Text(
                        text = "SMART",
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                }
                items(SMART_RULES) { rule ->
                    GlassCard(modifier = Modifier.clickable { onOpenSmart(rule.id.wire) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(rule.title, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                                Text(rule.tagline, style = MaterialTheme.typography.bodySmall, color = tokens.textSecondary)
                            }
                            BubbleButton(
                                icon = ICON_GLYPHS.getValue("play"),
                                contentDescription = rule.title,
                                onClick = { onOpenSmart(rule.id.wire) },
                            )
                        }
                    }
                }
                if (state.playlists.isEmpty() && !state.loading) {
                    item {
                        EmptyState(
                            icon = "playlist",
                            title = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_playlists)
                            } else {
                                stringResource(R.string.library_no_match)
                            },
                            body = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_playlists_body)
                            } else {
                                stringResource(R.string.library_no_match_body, state.query)
                            },
                        )
                    }
                }
                items(state.playlists, key = { it.playlist.id }) { summary ->
                    PlaylistRow(
                        summary = summary,
                        onOpenAi = onOpenAi,
                        onOpen = { onOpenPlaylist(summary.playlist.id) },
                        onDelete = { pendingDelete = summary },
                    )
                }
            }
            LibraryView.Recent -> {
                if (state.recents.isEmpty() && !state.loading) {
                    item {
                        EmptyState(
                            icon = "time",
                            title = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_recent)
                            } else {
                                stringResource(R.string.library_no_match)
                            },
                            body = if (state.query.isEmpty()) {
                                stringResource(R.string.library_empty_recent_body)
                            } else {
                                stringResource(R.string.library_no_match_body, state.query)
                            },
                        )
                    }
                }
                items(state.recents) { play ->
                    RecentRow(
                        play = play,
                        onOpen = {
                            when (play) {
                                is RecentPlay.FolderPlay -> onOpenFolder(play.folder.key)
                                is RecentPlay.PlaylistPlay -> onOpenPlaylist(play.playlist.id)
                                is RecentPlay.TrackPlay -> onOpenTrack(play.track.id)
                            }
                        },
                        onPlay = { viewModel.playRecent(play) },
                    )
                }
            }
        }

        item {
            PrimaryButton(
                label = stringResource(R.string.library_add_audio),
                onClick = onImport,
            )
        }
    }

    if (showLanguage) {
        GlassSheet(
            onDismiss = { showLanguage = false },
            title = stringResource(R.string.library_language_prompt_title),
        ) {
            Text(
                text = stringResource(R.string.library_language_prompt_body),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                modifier = Modifier.padding(bottom = geo.spacing.md),
            )
            LANGUAGE_OPTIONS.forEach { (code, label) ->
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = geo.spacing.sm)
                        .clickable {
                            viewModel.setLanguage(code)
                            showLanguage = false
                        },
                ) {
                    Text(label, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                }
            }
            TextButton(onClick = { showLanguage = false }) {
                Text(stringResource(R.string.library_language_not_now), color = tokens.textSecondary)
            }
            Spacer(Modifier.height(geo.spacing.xl))
        }
    }

    pendingDelete?.let { summary ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            containerColor = tokens.canvasBase,
            titleContentColor = tokens.text,
            textContentColor = tokens.textSecondary,
            title = { Text(stringResource(R.string.library_playlist_delete_title)) },
            text = { Text(stringResource(R.string.library_playlist_delete_body)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deletePlaylist(summary.playlist.id)
                    pendingDelete = null
                }) {
                    Text(stringResource(R.string.library_playlist_delete_action), color = tokens.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.library_playlist_cancel), color = tokens.text)
                }
            },
        )
    }
}

@Composable
private fun viewLabel(view: LibraryView): String = when (view) {
    LibraryView.Online -> stringResource(R.string.library_view_online)
    LibraryView.Tracks -> stringResource(R.string.library_view_tracks)
    LibraryView.Folders -> stringResource(R.string.library_view_folders)
    LibraryView.Playlists -> stringResource(R.string.library_view_playlists)
    LibraryView.Recent -> stringResource(R.string.library_view_recent)
}

private fun viewIcon(view: LibraryView): String = when (view) {
    LibraryView.Online -> "globe"
    LibraryView.Tracks -> "music"
    LibraryView.Folders -> "folder"
    LibraryView.Playlists -> "playlists"
    LibraryView.Recent -> "clock"
}

@Composable
private fun SpotlightCard(card: TrackCard, onPlay: (TrackCard) -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaletteTile(
                contentHash = card.track.contentHash,
                label = card.track.title,
                artworkUrl = card.track.artworkUrl,
                size = geo.tiles.lg,
            )
            Spacer(Modifier.size(geo.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.library_continue_listening).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.textSecondary,
                )
                Text(
                    text = card.track.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = card.track.author ?: formatDuration(card.track.durationSec),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            BubbleButton(
                icon = ICON_GLYPHS.getValue("play"),
                contentDescription = stringResource(R.string.library_play),
                onClick = { onPlay(card) },
                filled = true,
            )
        }
    }
}

@Composable
private fun SourceShelfRow(source: OnlineSource, onClick: () -> Unit) {
    val geo = LocalPejvakGeometry.current
    ListRow(
        title = source.name,
        subtitle = source.description,
        meta = listOfNotNull(source.nativeName, if (source.live) stringResource(R.string.discover_live) else null)
            .joinToString(" · ")
            .ifBlank { null },
        leading = { PaletteTile(contentHash = source.id, label = source.name, size = geo.tiles.md) },
        onClick = onClick,
    )
}

@Composable
private fun TrackRow(card: TrackCard, onOpenAi: () -> Unit, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaletteTile(
                contentHash = card.track.contentHash,
                label = card.track.title,
                artworkUrl = card.track.artworkUrl,
                size = geo.tiles.md,
            )
            Spacer(Modifier.size(geo.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = card.track.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = trackMeta(card),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            AiActionButton(onClick = onOpenAi)
        }
    }
}

@Composable
private fun trackMeta(card: TrackCard): String {
    val parts = ArrayList<String>()
    parts.add(
        if (card.track.totalPlayCount == 1) stringResource(R.string.library_play_count_one)
        else stringResource(R.string.library_play_count, card.track.totalPlayCount),
    )
    if (card.noteCount > 0) {
        parts.add(
            if (card.noteCount == 1) stringResource(R.string.library_note_count_one)
            else stringResource(R.string.library_notes_count, card.noteCount),
        )
    }
    card.track.lastPlayedAt?.let { parts.add(describeRecentWhen(it)) }
    return parts.joinToString(" · ")
}

@Composable
private fun FolderRow(summary: FolderSummary, onOpenAi: () -> Unit, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaletteTile(
                contentHash = summary.folder.key,
                label = summary.folder.name,
                size = geo.tiles.md,
            )
            Spacer(Modifier.size(geo.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = summary.folder.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${describeFolderProgress(summary.finishedCount, summary.trackCount)} · ${formatDuration(summary.totalDurationSec)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
                Spacer(Modifier.height(geo.spacing.sm))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(geo.radius.pill))
                        .background(tokens.glassBorder),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(
                                folderProgressRatio(summary.finishedCount, summary.trackCount).toFloat(),
                            )
                            .height(4.dp)
                            .clip(RoundedCornerShape(geo.radius.pill))
                            .background(tokens.accentTeal),
                    )
                }
            }
            AiActionButton(onClick = onOpenAi)
        }
    }
}

@Composable
private fun PlaylistRow(
    summary: PlaylistSummary,
    onOpenAi: () -> Unit,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = Modifier.clickable(onClick = onOpen)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaletteTile(
                contentHash = summary.playlist.id,
                label = summary.playlist.title,
                size = geo.tiles.md,
            )
            Spacer(Modifier.size(geo.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = summary.playlist.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${summary.trackCount} tracks · ${formatDuration(summary.totalDurationSec)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            ActionCluster {
                AiActionButton(onClick = onOpenAi)
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("delete"),
                    contentDescription = stringResource(R.string.library_playlist_delete_action),
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun RecentRow(play: RecentPlay, onOpen: () -> Unit, onPlay: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val title = when (play) {
        is RecentPlay.FolderPlay -> play.folder.name
        is RecentPlay.PlaylistPlay -> play.playlist.title
        is RecentPlay.TrackPlay -> play.track.title
    }
    val meta = when (play) {
        is RecentPlay.FolderPlay -> stringResource(R.string.library_view_folders)
        is RecentPlay.PlaylistPlay -> stringResource(R.string.library_view_playlists)
        is RecentPlay.TrackPlay -> play.track.author ?: formatDuration(play.track.durationSec)
    }
    GlassCard(modifier = Modifier.clickable(onClick = onOpen)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PaletteTile(
                contentHash = when (play) {
                    is RecentPlay.FolderPlay -> play.folder.key
                    is RecentPlay.PlaylistPlay -> play.playlist.id
                    is RecentPlay.TrackPlay -> play.track.contentHash
                },
                label = title,
                artworkUrl = (play as? RecentPlay.TrackPlay)?.track?.artworkUrl,
                size = geo.tiles.md,
            )
            Spacer(Modifier.size(geo.spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "$meta · ${describeRecentWhen(play.lastPlayedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            BubbleButton(
                icon = ICON_GLYPHS.getValue("play"),
                contentDescription = stringResource(R.string.library_play),
                onClick = onPlay,
            )
        }
    }
}
