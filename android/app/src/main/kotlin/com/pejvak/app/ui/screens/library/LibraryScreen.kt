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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
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
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.HeaderSearch
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance
import kotlinx.coroutines.launch

private val LANGUAGE_OPTIONS = listOf(
    "en" to "English",
    "fa" to "فارسی",
    "ar" to "العربية",
    "fr" to "Français",
)

/** The library's views in the order the chip row shows them, so the swipe and the
 *  chips can never disagree about what "next" means. */
private fun libraryViews(online: Boolean): List<LibraryView> = buildList {
    if (online) add(LibraryView.Online)
    add(LibraryView.Tracks)
    add(LibraryView.Folders)
    add(LibraryView.Playlists)
    add(LibraryView.Recent)
}

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
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val scope = rememberCoroutineScope()
    var showLanguage by rememberSaveable { mutableStateOf(false) }
    var languageAsked by rememberSaveable { mutableStateOf(false) }
    var newPlaylist by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<PlaylistSummary?>(null) }
    var menuOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(state.loading, state.languageCode) {
        if (!state.loading && state.languageCode == null && !languageAsked) {
            languageAsked = true
            showLanguage = true
        }
    }

    // The chips are the library's own tabs, and they are **pages**, not routes:
    // five full-width pages the finger drags through, so half a swipe shows both
    // neighbours instead of snapping to one. The dock is the only way between
    // screens — there is no swipe out of the Library any more.
    val views = remember(state.languageCode) { libraryViews(state.languageCode != null) }
    val pagerState = rememberPagerState(
        initialPage = views.indexOf(state.view).coerceAtLeast(0),
    ) { views.size }
    val chipState = rememberLazyListState()

    // The page the finger lands on is the view. The chips read `currentPage`, not
    // `state.view`, so the highlight crosses over with the content mid-drag.
    LaunchedEffect(pagerState.settledPage) {
        views.getOrNull(pagerState.settledPage)?.let(viewModel::setView)
    }

    // A language choice inserts "Online" at the front, which shifts every index;
    // follow the view the user was actually on.
    LaunchedEffect(views) {
        val target = views.indexOf(state.view)
        if (target >= 0 && target != pagerState.currentPage) pagerState.scrollToPage(target)
    }

    // Keep the selected chip on screen and carry it there with the page: on
    // "Playlists" or "Recent" it used to sit outside the row entirely.
    LaunchedEffect(pagerState.currentPage) {
        chipState.animateScrollToItem((pagerState.currentPage - 1).coerceAtLeast(0))
    }

    LaunchedEffect(pagerState.settledPage, state.loading) {
        if (!state.loading) viewModel.backfillArtwork()
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.library_title),
                overline = stringResource(R.string.library_overline),
                search = HeaderSearch(
                    value = state.query,
                    onValueChange = viewModel::setQuery,
                    placeholder = stringResource(R.string.library_search_placeholder),
                ),
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("settings"),
                        contentDescription = stringResource(R.string.header_screen_menu),
                        onClick = { menuOpen = true },
                    )
                },
            )
        },
        subHeader = {
            LazyRow(
                state = chipState,
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = geo.spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                itemsIndexed(views) { index, view ->
                    val count = state.counts[view]
                    GlassChip(
                        label = viewLabel(view),
                        selected = index == pagerState.currentPage,
                        frosted = true,
                        icon = viewIcon(view),
                        count = if (state.query.isNotEmpty() && count != null) count else null,
                        onClick = {
                            scope.launch { pagerState.animateScrollToPage(index) }
                        },
                    )
                }
            }
        },
    ) { topInset ->
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            val view = views.getOrNull(page) ?: return@HorizontalPager
            LibraryPage(
                view = view,
                state = state,
                topInset = topInset,
                newPlaylist = newPlaylist,
                onNewPlaylistChange = { newPlaylist = it },
                onCreatePlaylist = {
                    viewModel.createPlaylist(newPlaylist)
                    newPlaylist = ""
                },
                onDeletePlaylist = { pendingDelete = it },
                onOpenTrack = onOpenTrack,
                onOpenFolder = onOpenFolder,
                onOpenPlaylist = onOpenPlaylist,
                onOpenSmart = onOpenSmart,
                onOpenMissing = onOpenMissing,
                onOpenSource = onOpenSource,
                onOpenAi = onOpenAi,
                onImport = onImport,
                onSetOrigin = viewModel::setOrigin,
                onPlayTrack = { card -> viewModel.playTrack(card.track, state.tracks.map { it.track }) },
                onPlayRecent = viewModel::playRecent,
            )
        }
    }

    if (menuOpen) {
        GlassSheet(
            onDismiss = { menuOpen = false },
            title = stringResource(R.string.library_title),
            icon = "settings",
        ) {
            ListGroup(items = listOf("settings", "language")) { item, _ ->
                when (item) {
                    "settings" -> ListRow(
                        title = stringResource(R.string.settings_title),
                        leading = {
                            PejvakIcon(
                                name = "settings",
                                contentDescription = null,
                                tint = tokens.textSecondary,
                                size = geo.icons.md,
                            )
                        },
                        onClick = {
                            menuOpen = false
                            onOpenSettings()
                        },
                    )

                    else -> ListRow(
                        title = stringResource(R.string.header_language),
                        subtitle = state.languageCode?.let { code ->
                            LANGUAGE_OPTIONS.firstOrNull { it.first == code }?.second ?: code
                        } ?: stringResource(R.string.library_language_choose),
                        leading = {
                            PejvakIcon(
                                name = "language",
                                contentDescription = null,
                                tint = tokens.textSecondary,
                                size = geo.icons.md,
                            )
                        },
                        onClick = {
                            menuOpen = false
                            showLanguage = true
                        },
                    )
                }
            }
            Spacer(Modifier.height(geo.spacing.xl))
        }
    }

    if (showLanguage) {
        GlassSheet(
            onDismiss = { showLanguage = false },
            title = stringResource(R.string.library_language_prompt_title),
            icon = "language",
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
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    PejvakIcon("warning", null, tint = tokens.danger, size = geo.icons.md)
                    Text(stringResource(R.string.library_playlist_delete_title))
                }
            },
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

/**
 * One page of the library pager. Every page renders from the same [state] — the
 * view model loads all five lists anyway — so a swipe only changes which page is
 * on screen, never what is loaded.
 */
@Composable
private fun LibraryPage(
    view: LibraryView,
    state: LibraryUiState,
    topInset: Dp,
    newPlaylist: String,
    onNewPlaylistChange: (String) -> Unit,
    onCreatePlaylist: () -> Unit,
    onDeletePlaylist: (PlaylistSummary) -> Unit,
    onOpenTrack: (String) -> Unit,
    onOpenFolder: (String) -> Unit,
    onOpenPlaylist: (String) -> Unit,
    onOpenSmart: (String) -> Unit,
    onOpenMissing: () -> Unit,
    onOpenSource: (String) -> Unit,
    onOpenAi: () -> Unit,
    onImport: () -> Unit,
    onSetOrigin: (TrackOriginTab) -> Unit,
    onPlayTrack: (TrackCard) -> Unit,
    onPlayRecent: (RecentPlay) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val hasViewData = when (view) {
        LibraryView.Online -> state.sources.isNotEmpty()
        LibraryView.Tracks -> state.tracks.isNotEmpty()
        LibraryView.Folders -> state.folders.isNotEmpty()
        LibraryView.Playlists -> state.playlists.isNotEmpty()
        LibraryView.Recent -> state.recents.isNotEmpty()
    }
    val staggerList = state.query.isEmpty()

    OceanCascade(key = Triple(view, state.origin, hasViewData)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = geo.spacing.lg,
                end = geo.spacing.lg,
                top = topInset,
                bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
            ),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            var order = 0
            if (view == LibraryView.Tracks && state.hasBothOrigins) {
                val idx = order++
                item {
                    Row(
                        modifier = Modifier.oceanEntrance(idx, staggerEnabled = staggerList, swayDp = 0.dp),
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                    ) {
                        GlassChip(
                            label = stringResource(R.string.library_origin_local),
                            selected = state.origin == TrackOriginTab.Local,
                            count = state.localCount,
                            icon = "folder",
                            onClick = { onSetOrigin(TrackOriginTab.Local) },
                        )
                        GlassChip(
                            label = stringResource(R.string.library_origin_online),
                            selected = state.origin == TrackOriginTab.Online,
                            count = state.onlineCount,
                            icon = "online",
                            onClick = { onSetOrigin(TrackOriginTab.Online) },
                        )
                    }
                }
            }
            if (state.spotlight != null && state.query.isEmpty() && view != LibraryView.Online) {
                val idx = order++
                item { SpotlightCard(state.spotlight, onPlayTrack, modifier = Modifier.oceanEntrance(idx)) }
            }
            if (state.missingCount > 0) {
                val idx = order++
                item {
                    GlassCard(
                        modifier = Modifier
                            .oceanEntrance(idx)
                            .clickable(onClick = onOpenMissing),
                    ) {
                        InlineNotice(
                            tone = NoticeTone.Danger,
                            title = stringResource(R.string.library_missing_title),
                            message = stringResource(R.string.library_missing_body),
                        )
                    }
                }
            }
            if (state.elsewhere != null && state.view == view) {
                item {
                    Text(
                        text = state.elsewhere,
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                    )
                }
            }

            when (view) {
                LibraryView.Online -> {
                    if (state.sources.isEmpty()) {
                        val idx = order++
                        item {
                            EmptyState(
                                icon = "language",
                                title = stringResource(R.string.discover_no_sources),
                                body = stringResource(R.string.discover_no_sources_body),
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
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
                        val idx = order++
                        item {
                            ListGroup(
                                items = state.sources,
                                modifier = Modifier.oceanEntrance(idx),
                                staggerRows = true,
                            ) { source, _ ->
                                SourceShelfRow(source = source, onClick = { onOpenSource(source.id) })
                            }
                        }
                    }
                }

                LibraryView.Tracks -> {
                    if (state.tracks.isEmpty() && !state.loading) {
                        val idx = order++
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
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    val baseIndex = order
                    order += state.tracks.size
                    itemsIndexed(state.tracks, key = { _, card -> card.track.id }) { idx, card ->
                        TrackRow(
                            card = card,
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(baseIndex + idx, staggerEnabled = staggerList),
                        ) {
                            onOpenTrack(card.track.id)
                        }
                    }
                }

                LibraryView.Folders -> {
                    if (state.folders.isEmpty() && !state.loading) {
                        val idx = order++
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
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    val baseIndex = order
                    order += state.folders.size
                    itemsIndexed(state.folders, key = { _, summary -> summary.folder.key }) { idx, summary ->
                        FolderRow(
                            summary = summary,
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(baseIndex + idx, staggerEnabled = staggerList),
                        ) { onOpenFolder(summary.folder.key) }
                    }
                }

                LibraryView.Playlists -> {
                    val createIdx = order++
                    item {
                        GlassCard(modifier = Modifier.oceanEntrance(createIdx, staggerEnabled = staggerList)) {
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
                                        onValueChange = onNewPlaylistChange,
                                        modifier = Modifier.weight(1f),
                                        placeholder = stringResource(R.string.library_playlist_name),
                                    )
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("add"),
                                        contentDescription = stringResource(R.string.library_playlist_create),
                                        onClick = onCreatePlaylist,
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
                    val smartBase = order
                    order += SMART_RULES.size
                    itemsIndexed(SMART_RULES) { idx, rule ->
                        GlassCard(
                            modifier = Modifier
                                .oceanEntrance(smartBase + idx, staggerEnabled = staggerList)
                                .clickable { onOpenSmart(rule.id.wire) },
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(rule.title, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                                    Text(
                                        rule.tagline,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = tokens.textSecondary
                                    )
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
                        val idx = order++
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
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    val playlistBase = order
                    order += state.playlists.size
                    itemsIndexed(state.playlists, key = { _, summary -> summary.playlist.id }) { idx, summary ->
                        PlaylistRow(
                            summary = summary,
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(playlistBase + idx, staggerEnabled = staggerList),
                            onOpen = { onOpenPlaylist(summary.playlist.id) },
                            onDelete = { onDeletePlaylist(summary) },
                        )
                    }
                }

                LibraryView.Recent -> {
                    if (state.recents.isEmpty() && !state.loading) {
                        val idx = order++
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
                                modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            )
                        }
                    }
                    val recentBase = order
                    order += state.recents.size
                    itemsIndexed(state.recents) { idx, play ->
                        RecentRow(
                            play = play,
                            modifier = Modifier.oceanEntrance(recentBase + idx, staggerEnabled = staggerList),
                            onOpen = {
                                when (play) {
                                    is RecentPlay.FolderPlay -> onOpenFolder(play.folder.key)
                                    is RecentPlay.PlaylistPlay -> onOpenPlaylist(play.playlist.id)
                                    is RecentPlay.TrackPlay -> onOpenTrack(play.track.id)
                                }
                            },
                            onPlay = { onPlayRecent(play) },
                        )
                    }
                }
            }

            val footerIdx = order
            item {
                PrimaryButton(
                    label = stringResource(R.string.library_add_audio),
                    onClick = onImport,
                    modifier = Modifier.oceanEntrance(footerIdx, staggerEnabled = staggerList, swayDp = 0.dp),
                )
            }
        }
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
    LibraryView.Online -> "online"
    LibraryView.Tracks -> "music"
    LibraryView.Folders -> "folder"
    LibraryView.Playlists -> "playlist"
    LibraryView.Recent -> "time"
}

@Composable
private fun SpotlightCard(
    card: TrackCard,
    onPlay: (TrackCard) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier) {
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
private fun TrackRow(
    card: TrackCard,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier.clickable(onClick = onClick)) {
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
private fun FolderRow(
    summary: FolderSummary,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier.clickable(onClick = onClick)) {
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
                    text = "${describeFolderProgress(summary.finishedCount, summary.trackCount)} · ${
                        formatDuration(
                            summary.totalDurationSec
                        )
                    }",
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
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier.clickable(onClick = onOpen)) {
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
private fun RecentRow(
    play: RecentPlay,
    onOpen: () -> Unit,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier,
) {
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
    GlassCard(modifier = modifier.clickable(onClick = onOpen)) {
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
