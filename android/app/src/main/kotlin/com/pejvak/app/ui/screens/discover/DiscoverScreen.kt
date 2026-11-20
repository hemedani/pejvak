package com.pejvak.app.ui.screens.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.describeDownloadState
import com.pejvak.app.domain.online.findLanguage
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.RowAction
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
fun DiscoverScreen(
    onOpenCollection: (key: String, trackId: String?, positionSec: Int) -> Unit,
    onOpenSource: (String) -> Unit,
    onOpenLanguage: (String) -> Unit,
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val pager = rememberPagerState(initialPage = state.page) { 3 }
    LaunchedEffect(pager) {
        snapshotFlow { pager.currentPage }.distinctUntilChanged().collect(viewModel::setPage)
    }
    LaunchedEffect(state.page) {
        if (pager.currentPage != state.page) pager.animateScrollToPage(state.page)
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.tab_discover),
                subtitle = findLanguage(state.languageCode)?.let { "${it.nativeName} · ${it.name}" },
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("language"),
                        contentDescription = stringResource(R.string.discover_choose_language),
                        onClick = viewModel::openLanguageSheet,
                    )
                },
            )
        },
    ) { topInset ->
        val density = LocalDensity.current
        var chipsHeight by remember { mutableStateOf(40.dp) }
        val topContentInset = topInset + geo.spacing.xs + chipsHeight + geo.spacing.sm
        Box(Modifier.fillMaxSize()) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                when (page) {
                    0 -> ContinuePage(
                        cards = state.continueRuns,
                        downloadStates = state.downloadStates,
                        topInset = topContentInset,
                        onOpen = onOpenCollection,
                    )

                    1 -> FavoritesPage(
                        favorites = state.favorites,
                        topInset = topContentInset,
                        onOpen = { key -> onOpenCollection(key, null, 0) },
                        onUnfavorite = viewModel::unfavorite,
                    )

                    else -> BrowsePage(
                        state = state,
                        topInset = topContentInset,
                        onOpenSource = onOpenSource,
                        onOpenLanguage = onOpenLanguage,
                        onOpenLanguageSheet = viewModel::openLanguageSheet,
                    )
                }
            }
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(
                        start = geo.spacing.lg,
                        end = geo.spacing.lg,
                        top = topInset + geo.spacing.xs,
                    )
                    .onGloballyPositioned { coords ->
                        if (coords.size.height > 0) {
                            chipsHeight = with(density) { coords.size.height.toDp() }
                        }
                    },
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                GlassChip(
                    label = stringResource(R.string.discover_continue),
                    selected = state.page == 0,
                    onClick = { viewModel.setPage(0) },
                )
                GlassChip(
                    label = stringResource(R.string.discover_favorites),
                    selected = state.page == 1,
                    count = state.favorites.size.takeIf { it > 0 },
                    onClick = { viewModel.setPage(1) },
                )
                GlassChip(
                    label = stringResource(R.string.discover_browse),
                    selected = state.page == 2,
                    onClick = { viewModel.setPage(2) },
                )
            }
        }
    }
    if (state.languageSheetOpen) {
        LanguagePickerSheet(
            languages = viewModel.languages,
            selectedCode = state.languageCode,
            onSelect = viewModel::selectLanguage,
            onDismiss = viewModel::closeLanguageSheet,
        )
    }
}

@Composable
private fun ContinuePage(
    cards: List<ContinueCard>,
    downloadStates: Map<String, com.pejvak.app.domain.DownloadState>,
    topInset: Dp,
    onOpen: (key: String, trackId: String?, positionSec: Int) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    if (cards.isEmpty()) {
        EmptyState(
            icon = "play",
            title = stringResource(R.string.discover_no_continue),
            modifier = Modifier.padding(top = topInset),
            body = stringResource(R.string.discover_no_continue_body),
        )
        return
    }
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
        items(cards, key = { it.key }) { card ->
            ListGroup(items = listOf(card)) { _, _ ->
                ListRow(
                    title = card.title,
                    subtitle = "${card.sourceName} · ${
                        stringResource(
                            R.string.discover_resume_at,
                            formatResume(card.lastPositionSec)
                        )
                    }",
                    meta = listOfNotNull(
                        resumeMeta(card).ifBlank { null },
                        describeDownloadState(downloadStates[card.key])
                    )
                        .joinToString(" · ")
                        .ifBlank { null },
                    leading = {
                        PaletteTile(
                            contentHash = card.key,
                            label = card.title,
                            size = geo.tiles.md,
                        )
                    },
                    onClick = { onOpen(card.key, card.lastTrackId, card.lastPositionSec) },
                )
            }
        }
    }
}

@Composable
private fun FavoritesPage(
    favorites: List<OnlineCollection>,
    topInset: Dp,
    onOpen: (String) -> Unit,
    onUnfavorite: (String) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    if (favorites.isEmpty()) {
        EmptyState(
            icon = "favorite",
            title = stringResource(R.string.discover_no_favorites),
            modifier = Modifier.padding(top = topInset),
            body = stringResource(R.string.discover_no_favorites_body),
        )
        return
    }
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
        items(favorites, key = { it.key }) { saved ->
            ListGroup(items = listOf(saved)) { _, _ ->
                ListRow(
                    title = saved.title,
                    subtitle = saved.subtitle ?: saved.sourceId,
                    meta = listOfNotNull(
                        stringResource(R.string.discover_track_count, saved.trackCount),
                        describeDownloadState(saved.downloadState),
                    ).joinToString(" · "),
                    leading = {
                        PaletteTile(
                            contentHash = saved.key,
                            label = saved.title,
                            artworkUrl = saved.artworkUrl,
                            size = geo.tiles.md,
                        )
                    },
                    actions = listOf(
                        RowAction(
                            id = "unfavorite",
                            icon = "favorite",
                            label = stringResource(R.string.discover_unfavorite),
                            priority = 0,
                            onClick = { onUnfavorite(saved.key) },
                        ),
                    ),
                    onClick = { onOpen(saved.key) },
                )
            }
        }
    }
}

@Composable
private fun BrowsePage(
    state: DiscoverUiState,
    topInset: Dp,
    onOpenSource: (String) -> Unit,
    onOpenLanguage: (String) -> Unit,
    onOpenLanguageSheet: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
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
        item {
            GlassChip(
                label = stringResource(R.string.discover_browse_all_languages),
                icon = "language",
                onClick = onOpenLanguageSheet,
            )
        }
        item {
            Text(
                text = stringResource(R.string.discover_sources_here),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
        }
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
                ListGroup(items = state.sources) { source, _ ->
                    SourceRow(source = source, onClick = { onOpenSource(source.id) })
                }
            }
        }
        item {
            GlassChip(
                label = stringResource(R.string.discover_language_sources),
                icon = "language",
                onClick = { onOpenLanguage(state.languageCode) },
            )
        }
    }
}

@Composable
private fun SourceRow(source: OnlineSource, onClick: () -> Unit) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.md),
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        PaletteTile(contentHash = source.id, label = source.name, size = geo.tiles.md)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                Text(source.name, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                if (source.live) {
                    Text(
                        stringResource(R.string.discover_live),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.accentTeal
                    )
                }
            }
            Text(source.description, style = MaterialTheme.typography.bodySmall, color = tokens.textSecondary)
        }
    }
}

private fun formatResume(positionSec: Int): String {
    val minutes = positionSec / 60
    val seconds = positionSec % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private fun resumeMeta(card: ContinueCard): String =
    if (card.trackCount > 0) "${card.finishedCount} / ${card.trackCount}" else ""
