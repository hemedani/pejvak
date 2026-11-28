package com.pejvak.app.ui.screens.history

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.HistorySection
import com.pejvak.app.domain.HistorySort
import com.pejvak.app.domain.HistoryStretchEntry
import com.pejvak.app.domain.ListeningStats
import com.pejvak.app.domain.StretchOutcome
import com.pejvak.app.domain.TrackLeader
import com.pejvak.app.domain.describeContextType
import com.pejvak.app.domain.describeDateRange
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.describeRunOutcome
import com.pejvak.app.domain.describeStretchOutcome
import com.pejvak.app.domain.describeStretchTitle
import com.pejvak.app.domain.describeStretchTracks
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatTimeRange
import com.pejvak.app.domain.runProgressRatio
import com.pejvak.app.domain.shape
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.StatTile
import com.pejvak.app.ui.components.HeaderSearch
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SyncWaveLoader
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.history.DateRangeSheet
import com.pejvak.app.ui.components.history.SessionDetailSheet
import com.pejvak.app.domain.paletteIndexFor
import com.pejvak.app.ui.components.WaveProgressBar
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onOpenAi: () -> Unit,
    onCreateChannel: () -> Unit,
    onOpenAccount: () -> Unit,
    viewModel: HistoryViewModel = hiltViewModel(),
    onOpenCollection: ((ContextPlay) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResume() }
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val pagerState = rememberPagerState(pageCount = { 2 })
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var rangeOpen by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }

    LaunchedEffect(pagerState.currentPage) {
        viewModel.setPanel(if (pagerState.currentPage == 0) HistoryPanel.History else HistoryPanel.Stats)
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.tab_history),
                overline = stringResource(R.string.history_overline),
                subtitle = stringResource(
                    R.string.history_subtitle,
                    formatDuration(state.stats.totalListenTimeSec),
                    state.stats.sessionCount,
                ),
                search = HeaderSearch(
                    value = state.query,
                    onValueChange = viewModel::setQuery,
                    placeholder = stringResource(R.string.history_search_placeholder),
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
        subHeader = {
            Row(
                modifier = Modifier.padding(horizontal = geo.spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                GlassChip(
                    label = stringResource(R.string.history_panel_history),
                    selected = state.panel == HistoryPanel.History,
                    frosted = true,
                    icon = "history",
                    onClick = { scope.launch { pagerState.animateScrollToPage(0) } },
                )
                GlassChip(
                    label = stringResource(R.string.history_panel_stats),
                    selected = state.panel == HistoryPanel.Stats,
                    frosted = true,
                    icon = "equalizer",
                    onClick = { scope.launch { pagerState.animateScrollToPage(1) } },
                )
            }
        },
    ) { topInset ->
        val pullState = rememberPullToRefreshState()
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            if (page == 0) {
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = viewModel::refresh,
                    state = pullState,
                    modifier = Modifier.fillMaxSize(),
                    indicator = {
                        PullToRefreshDefaults.Indicator(
                            state = pullState,
                            isRefreshing = state.refreshing,
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = topInset),
                        )
                    },
                ) {
                    HistoryList(
                        state = state,
                        topInset = topInset,
                        onTab = viewModel::setTab,
                        onOpenStretch = { entry ->
                            entry.end.let(viewModel::openSession)
                        },
                        onDeleteStretch = viewModel::deleteStretch,
                        onOpenRun = { run ->
                            if (onOpenCollection != null) onOpenCollection(run)
                            else viewModel.openCollection(run)
                        },
                        onDeleteRun = viewModel::deleteRun,
                        onLoadMore = viewModel::loadMore,
                        onToggleSelectionMode = viewModel::toggleSelectionMode,
                        onToggleSelected = viewModel::toggleSelected,
                        onDeleteSelected = viewModel::deleteSelected,
                        onOpenAi = onOpenAi,
                        onOpenAccount = onOpenAccount,
                        onRetrySync = viewModel::retrySync,
                        onDismissSyncNotice = viewModel::dismissSyncNotice,
                    )
                }
            } else {
                StatsPanel(
                    stats = state.stats,
                    leaders = state.leaders,
                    daily = state.daily,
                    streak = state.streak,
                    bestStreak = state.bestStreak,
                    media = state.media,
                    topInset = topInset,
                )
            }
        }
    }

    if (menuOpen) {
        GlassSheet(
            onDismiss = { menuOpen = false },
            title = stringResource(R.string.header_actions),
            icon = "more",
        ) {
            ListGroup(
                items = listOf(
                    "refresh",
                    "sort-newest",
                    "sort-oldest",
                    "sort-longest",
                    "range",
                    "export"
                )
            ) { item, _ ->
                when {
                    item == "refresh" -> ListRow(
                        title = stringResource(R.string.history_refresh),
                        leading = { PejvakIcon("refresh", null, tint = tokens.textSecondary, size = geo.icons.md) },
                        onClick = { menuOpen = false; viewModel.refresh() },
                    )

                    item.startsWith("sort-") -> {
                        val sort = when (item) {
                            "sort-newest" -> HistorySort.Newest
                            "sort-oldest" -> HistorySort.Oldest
                            else -> HistorySort.Longest
                        }
                        ListRow(
                            title = when (sort) {
                                HistorySort.Newest -> stringResource(R.string.history_sort_newest)
                                HistorySort.Oldest -> stringResource(R.string.history_sort_oldest)
                                HistorySort.Longest -> stringResource(R.string.history_sort_longest)
                            },
                            leading = { PejvakIcon("sort", null, tint = tokens.textSecondary, size = geo.icons.md) },
                            trailing = {
                                if (state.sort == sort) PejvakIcon(
                                    "check",
                                    null,
                                    tint = tokens.accent,
                                    size = geo.icons.md
                                )
                            },
                            onClick = { menuOpen = false; viewModel.setSort(sort) },
                        )
                    }

                    item == "range" -> ListRow(
                        title = stringResource(R.string.header_date_range),
                        subtitle = describeDateRange(state.range),
                        leading = { PejvakIcon("time", null, tint = tokens.textSecondary, size = geo.icons.md) },
                        onClick = { menuOpen = false; rangeOpen = true },
                    )

                    else -> ListRow(
                        title = stringResource(R.string.history_export),
                        leading = { PejvakIcon("share", null, tint = tokens.textSecondary, size = geo.icons.md) },
                        onClick = {
                            menuOpen = false
                            val text = viewModel.markdown()
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/markdown"
                                putExtra(Intent.EXTRA_TEXT, text)
                                putExtra(Intent.EXTRA_SUBJECT, "Listening history")
                            }
                            context.startActivity(
                                Intent.createChooser(intent, context.getString(R.string.history_export)),
                            )
                        },
                    )
                }
            }
            Spacer(Modifier.height(geo.spacing.xl))
        }
    }

    if (rangeOpen) {
        DateRangeSheet(
            range = state.range,
            onDismiss = { rangeOpen = false },
            onPick = viewModel::setRange,
        )
    }

    state.detail?.let { item ->
        SessionDetailSheet(
            item = item,
            onDismiss = viewModel::dismissDetail,
            onResume = { viewModel.resumeSession(item) },
            onDelete = { viewModel.deleteSession(item) },
        )
    }

    state.detailRun?.let { run ->
        RunDetailSheet(
            run = run,
            onDismiss = viewModel::dismissDetail,
            onResume = {
                viewModel.resumeRun(run)
                viewModel.dismissDetail()
            },
            onDelete = { viewModel.deleteRun(run) },
        )
    }
}

@Composable
private fun HistoryList(
    state: HistoryUiState,
    topInset: Dp,
    onTab: (HistoryTab) -> Unit,
    onOpenStretch: (HistoryStretchEntry) -> Unit,
    onDeleteStretch: (HistoryStretchEntry) -> Unit,
    onOpenRun: (ContextPlay) -> Unit,
    onDeleteRun: (ContextPlay) -> Unit,
    onLoadMore: () -> Unit,
    onToggleSelectionMode: () -> Unit,
    onToggleSelected: (HistoryStretchEntry) -> Unit,
    onDeleteSelected: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenAccount: () -> Unit,
    onRetrySync: () -> Unit,
    onDismissSyncNotice: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val hasData =
        if (state.tab == HistoryTab.Sessions) state.sections.isNotEmpty() else state.filteredCollections.isNotEmpty()
    val staggerList = state.query.isBlank()
    // Each group shows up to 5 items until its "Show more" is tapped. Keys are namespaced
    // per tab so a track and a collection that share an id never collide.
    var expandedKeys by remember { mutableStateOf(setOf<String>()) }
    val groupPreview = 5

    OceanCascade(key = Pair(state.tab, hasData)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = geo.spacing.lg,
                end = geo.spacing.lg,
                top = topInset,
                bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
            ),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        ) {
            var order = 0
            val chipIdx = order++
            item {
                Row(
                    modifier = Modifier.oceanEntrance(chipIdx, staggerEnabled = staggerList, swayDp = 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    GlassChip(
                        label = stringResource(R.string.history_tab_sessions),
                        selected = state.tab == HistoryTab.Sessions,
                        icon = "history",
                        onClick = { onTab(HistoryTab.Sessions) },
                    )
                    GlassChip(
                        label = stringResource(R.string.history_tab_collections),
                        selected = state.tab == HistoryTab.Collections,
                        icon = "queue",
                        onClick = { onTab(HistoryTab.Collections) },
                    )
                    if (state.tab == HistoryTab.Sessions) {
                        GlassChip(
                            label = if (state.selectionMode) stringResource(R.string.action_done)
                            else stringResource(R.string.history_select),
                            selected = state.selectionMode,
                            icon = "check",
                            onClick = onToggleSelectionMode,
                        )
                    }
                }
            }
            if (state.selectionMode && state.selected.isNotEmpty()) {
                item {
                    PrimaryButton(
                        label = stringResource(R.string.history_delete_selected, state.selected.size),
                        onClick = onDeleteSelected,
                    )
                }
            }

            if (state.tab == HistoryTab.Sessions) {
                // Plan 09 UX-05: the wave loader while the online-first server check runs, and a
                // non-blocking retry notice on failure.
                if (state.syncing) {
                    item { SyncWaveLoader(message = stringResource(R.string.history_syncing)) }
                }
                if (state.syncNotice != null) {
                    item {
                        InlineNotice(
                            message = state.syncNotice,
                            tone = NoticeTone.Warning,
                            title = stringResource(R.string.history_sync_failed),
                            retryLabel = stringResource(R.string.action_retry),
                            onRetry = onRetrySync,
                        )
                    }
                }
                if (state.sections.isEmpty() && !state.loading && !state.syncing) {
                    val emptyIdx = order++
                    item {
                        if (!state.signedIn) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(geo.spacing.xl),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
                            ) {
                                EmptyState(
                                    icon = "history",
                                    title = stringResource(R.string.history_sign_in_title),
                                    body = stringResource(R.string.history_sign_in_body),
                                )
                                PrimaryButton(
                                    label = stringResource(R.string.history_sign_in_action),
                                    onClick = onOpenAccount,
                                )
                            }
                        } else {
                            EmptyState(
                                icon = "history",
                                title = stringResource(R.string.history_empty),
                                body = stringResource(R.string.history_empty_body),
                                modifier = Modifier.oceanEntrance(emptyIdx, swayDp = 0.dp),
                            )
                        }
                    }
                }
                state.sections.forEach { section ->
                    val sectionKey = "s:${section.key}"
                    val isOpen = sectionKey in expandedKeys
                    val shown = if (isOpen) section.data else section.data.take(groupPreview)
                    val headerIdx = order++
                    item(key = "h-${section.key}") {
                        SectionHeader(
                            section = section,
                            modifier = Modifier.oceanEntrance(
                                index = headerIdx,
                                staggerEnabled = staggerList,
                                riseDp = 8.dp,
                                swayDp = 0.dp,
                                startScale = 1f,
                            ),
                        )
                    }
                    val sectionBase = order
                    order += shown.size
                    itemsIndexed(shown, key = { _, entry -> entry.stretch.id }) { idx, entry ->
                        StretchCard(
                            entry = entry,
                            sort = state.sort,
                            selectionMode = state.selectionMode,
                            selected = state.selected.containsAll(entry.items.map { it.session.id }),
                            onToggle = { onToggleSelected(entry) },
                            onOpen = { onOpenStretch(entry) },
                            onDelete = { onDeleteStretch(entry) },
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(sectionBase + idx, staggerEnabled = staggerList),
                        )
                    }
                    if (section.data.size > groupPreview) {
                        val hidden = section.data.size - shown.size
                        item(key = "more-$sectionKey") {
                            ShowMoreRow(
                                expanded = isOpen,
                                hiddenCount = hidden,
                                onToggle = {
                                    expandedKeys =
                                        if (isOpen) expandedKeys - sectionKey
                                        else expandedKeys + sectionKey
                                },
                            )
                        }
                    }
                }
                if (state.hasMore && state.query.isBlank()) {
                    item {
                        PrimaryButton(
                            label = stringResource(R.string.history_load_more),
                            onClick = onLoadMore,
                        )
                    }
                }
            } else {
                if (state.filteredCollections.isEmpty() && !state.loading) {
                    val emptyIdx = order++
                    item {
                        EmptyState(
                            icon = "queue",
                            title = stringResource(R.string.history_no_collections),
                            body = stringResource(R.string.history_no_collections_body),
                            modifier = Modifier.oceanEntrance(emptyIdx, swayDp = 0.dp),
                        )
                    }
                }
                state.groupedCollections.forEach { section ->
                    val sectionKey = "c:${section.key}"
                    val isOpen = sectionKey in expandedKeys
                    val shown = if (isOpen) section.data else section.data.take(groupPreview)
                    val headerIdx = order++
                    item(key = "ch-${section.key}") {
                        CollectionSectionHeader(
                            section = section,
                            modifier = Modifier.oceanEntrance(
                                index = headerIdx,
                                staggerEnabled = staggerList,
                                riseDp = 8.dp,
                                swayDp = 0.dp,
                                startScale = 1f,
                            ),
                        )
                    }
                    val runBase = order
                    order += shown.size
                    itemsIndexed(shown, key = { _, run -> run.id }) { idx, run ->
                        RunCard(
                            run = run,
                            sort = state.sort,
                            onOpen = { onOpenRun(run) },
                            onDelete = { onDeleteRun(run) },
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(runBase + idx, staggerEnabled = staggerList),
                        )
                    }
                    if (section.data.size > groupPreview) {
                        val hidden = section.data.size - shown.size
                        item(key = "more-$sectionKey") {
                            ShowMoreRow(
                                expanded = isOpen,
                                hiddenCount = hidden,
                                onToggle = {
                                    expandedKeys =
                                        if (isOpen) expandedKeys - sectionKey
                                        else expandedKeys + sectionKey
                                },
                            )
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(geo.spacing.xxl)) }
        }
    }
}

@Composable
private fun SectionHeader(
    section: HistorySection<HistoryStretchEntry>,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val track = section.data.first().start.track
    Row(
        modifier.fillMaxWidth().padding(top = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        PaletteTile(
            contentHash = track.contentHash,
            label = track.title,
            artworkUrl = track.artworkUrl,
            size = geo.tiles.sm,
        )
        Text(
            text = section.title ?: track.title,
            style = MaterialTheme.typography.labelLarge,
            color = tokens.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "${section.data.size} · ${section.data.sumOf { it.stretch.listenedSec }.let(::formatDuration)}",
            style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
            color = tokens.textSecondary,
        )
    }
}

@Composable
private fun CollectionSectionHeader(
    section: HistorySection<ContextPlay>,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val first = section.data.first()
    Row(
        modifier.fillMaxWidth().padding(top = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.sm)
                .clip(CircleShape)
                .background(tokens.accentTeal.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon(
                name = contextTypeIcon(first.contextType),
                contentDescription = null,
                tint = tokens.accentTeal,
                size = geo.icons.sm,
            )
        }
        Text(
            text = section.title ?: describeContextType(first.contextType),
            style = MaterialTheme.typography.labelLarge,
            color = tokens.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "${section.data.size} · ${section.data.sumOf { it.listenedSec }.let(::formatDuration)}",
            style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
            color = tokens.textSecondary,
        )
    }
}

private fun contextTypeIcon(type: ContextType): String = when (type) {
    ContextType.Folder -> "folder"
    ContextType.Playlist -> "playlist"
    ContextType.Online -> "online"
}

/** The per-group expand control: reveals the rest of a group's items, or folds it back. */
@Composable
private fun ShowMoreRow(expanded: Boolean, hiddenCount: Int, onToggle: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(geo.radius.md))
            .clickable(onClick = onToggle)
            .padding(vertical = geo.spacing.sm),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (expanded) stringResource(R.string.history_show_less)
            else stringResource(R.string.history_show_more, hiddenCount),
            style = MaterialTheme.typography.labelLarge,
            color = tokens.accentTeal,
        )
        Spacer(Modifier.width(geo.spacing.xs))
        PejvakIcon(
            name = if (expanded) "chevronUp" else "chevronDown",
            contentDescription = null,
            tint = tokens.accentTeal,
            size = geo.icons.sm,
        )
    }
}

@Composable
private fun StretchCard(
    entry: HistoryStretchEntry,
    sort: HistorySort,
    selectionMode: Boolean,
    selected: Boolean,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val stretch = entry.stretch
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        HistoryRail(icons = stretchRailIcons(entry, sort))
        Spacer(Modifier.width(geo.spacing.sm))
        GlassCard(
            modifier = Modifier
                .weight(1f)
                .clickable(onClick = if (selectionMode) onToggle else onOpen),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = describeStretchTitle(entry),
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.text,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildString {
                            append(formatTimeRange(stretch.startedAt, stretch.endedAt))
                            append(" · ")
                            append(formatDuration(stretch.listenedSec))
                            if (stretch.trackCount > 1) append(" · ${describeStretchTracks(stretch)}")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    entry.start.contextTitle?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (selectionMode) {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue(if (selected) "check" else "add"),
                        contentDescription = stringResource(R.string.history_select),
                        onClick = onToggle,
                    )
                } else {
                    ActionCluster {
                        AiActionButton(onClick = onOpenAi)
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("delete"),
                            contentDescription = stringResource(R.string.action_delete),
                            onClick = onDelete,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RunCard(
    run: ContextPlay,
    sort: HistorySort,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        HistoryRail(icons = runRailIcons(run, sort))
        Spacer(Modifier.width(geo.spacing.sm))
        GlassCard(modifier = Modifier.weight(1f).clickable(onClick = onOpen)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = run.contextTitle,
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "${describeContextType(run.contextType)} · ${describeRunOutcome(run.shape()).label} · " +
                                "${run.finishedCount}/${run.trackCount} · ${formatDuration(run.listenedSec)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = describeRecentWhen(run.startedAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                }
                ActionCluster {
                    AiActionButton(onClick = onOpenAi)
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("delete"),
                        contentDescription = stringResource(R.string.action_delete),
                        onClick = onDelete,
                    )
                }
            }
        }
    }
}

/**
 * The record's left margin: a rounded glass strip holding the item's attributes —
 * ordering, collection kind, outcome and the few facts worth a glance. It is a
 * summary, not a control; nothing here is clickable.
 */
@Composable
private fun HistoryRail(icons: List<String>, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val glyph = geo.icons.md
    val shape = RoundedCornerShape(geo.radius.tile)
    Column(
        modifier = modifier
            .width(glyph + geo.spacing.sm * 2)
            .clip(shape)
            .background(tokens.glassFill.copy(alpha = tokens.glassFill.alpha * 0.9f))
            .border(1.dp, tokens.glassBorder, shape)
            .padding(vertical = geo.spacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
    ) {
        icons.forEach { name ->
            PejvakIcon(
                name = name,
                contentDescription = null,
                tint = tokens.textTertiary,
                size = glyph,
            )
        }
    }
}

private fun sortRailIcon(sort: HistorySort): String = when (sort) {
    HistorySort.Newest -> "sort"
    HistorySort.Oldest -> "history"
    HistorySort.Longest -> "timer"
}

private fun contextRailIcon(type: ContextType?): String = when (type) {
    ContextType.Playlist -> "playlist"
    ContextType.Folder -> "folder"
    ContextType.Online -> "online"
    null -> "music"
}

private fun stretchRailIcons(entry: HistoryStretchEntry, sort: HistorySort): List<String> = buildList {
    add(sortRailIcon(sort))
    add(contextRailIcon(entry.stretch.contextType))
    add(
        when (describeStretchOutcome(entry.stretch)) {
            StretchOutcome.Complete, StretchOutcome.Finished -> "check"
            StretchOutcome.Interrupted -> "warning"
            StretchOutcome.Open -> "play"
        },
    )
    if (entry.stretch.trackCount > 1) add("queue")
    if (entry.stretch.seeked) add("forward30")
}.take(4)

private fun runRailIcons(run: ContextPlay, sort: HistorySort): List<String> = buildList {
    add(sortRailIcon(sort))
    add(contextRailIcon(run.contextType))
    add(if (run.shape().completed) "check" else "warning")
    if (run.trackCount > 1) add("queue")
}.take(4)

@Composable
private fun RunDetailSheet(
    run: ContextPlay,
    onDismiss: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(onDismiss = onDismiss, title = run.contextTitle, icon = "history") {
        // The run's own aurora identity (keyed on its collection) tints the progress wave.
        val heardColor = AuroraRamps[paletteIndexFor(run.contextKey)].third
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            WaveProgressBar(
                fraction = runProgressRatio(run.finishedCount, run.trackCount).toFloat(),
                color = heardColor,
                height = 26.dp,
            )
            GlassCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    FactRow("queue", stringResource(R.string.history_fact_progress), "${run.finishedCount} of ${run.trackCount}")
                    FactRow("time", stringResource(R.string.history_fact_listened), formatDuration(run.listenedSec))
                    FactRow("history", stringResource(R.string.history_fact_when), describeRecentWhen(run.startedAt))
                    FactRow(
                        icon = if (run.shape().completed) "check" else "warning",
                        label = stringResource(R.string.history_fact_status),
                        value = describeRunOutcome(run.shape()).label,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                Box(Modifier.weight(1f)) {
                    PrimaryButton(label = stringResource(R.string.history_resume), onClick = onResume)
                }
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("delete"),
                    contentDescription = stringResource(R.string.action_delete),
                    onClick = onDelete,
                )
            }
        }
    }
}

/** A labelled fact line with a leading glyph bubble, used across the detail sheets. */
@Composable
private fun FactRow(icon: String, label: String, value: String) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.sm)
                .clip(CircleShape)
                .background(tokens.accentTeal.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon(name = icon, contentDescription = null, tint = tokens.accentTeal, size = geo.icons.sm)
        }
        // Both columns weighted: a long value can never starve the label to zero width.
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(top = geo.spacing.xxs),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.text,
            textAlign = TextAlign.End,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1.3f),
        )
    }
}

@Composable
private fun StatsPanel(
    stats: ListeningStats,
    leaders: List<TrackLeader>,
    daily: List<com.pejvak.app.domain.DailyListen>,
    streak: Int,
    bestStreak: Int,
    media: com.pejvak.app.domain.MediaBreakdown,
    topInset: Dp,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    OceanCascade(key = stats.sessionCount > 0) {
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
                GlassCard(Modifier.fillMaxWidth().oceanEntrance(0)) {
                    Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xxs)) {
                        Text(
                            text = formatDuration(stats.totalListenTimeSec),
                            style = MaterialTheme.typography.displayLarge.copy(fontFeatureSettings = "tnum"),
                            color = tokens.text,
                        )
                        Text(
                            text = stringResource(R.string.history_stat_total),
                            style = MaterialTheme.typography.labelMedium,
                            color = tokens.textSecondary,
                        )
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    StatTile(
                        label = stringResource(R.string.history_stat_sessions),
                        value = stats.sessionCount.toString(),
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        label = stringResource(R.string.history_stat_tracks),
                        value = stats.trackCount.toString(),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    StatTile(
                        label = stringResource(R.string.history_stat_days),
                        value = stats.activeDayCount.toString(),
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        label = stringResource(R.string.history_stat_average),
                        value = formatDuration(stats.averageSessionSec),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    StatTile(
                        label = stringResource(R.string.history_stat_streak),
                        value = streak.toString(),
                        secondary = stringResource(R.string.history_stat_best, bestStreak),
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        label = stringResource(R.string.history_stat_longest),
                        value = formatDuration(stats.longestSessionSec),
                        secondary = stats.longestSessionTitle,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            item {
                MediaSplitCard(media, Modifier.oceanEntrance(1))
            }
            item {
                Row(
                    modifier = Modifier.oceanEntrance(1, swayDp = 0.dp, riseDp = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                ) {
                    PejvakIcon("equalizer", null, tint = tokens.textSecondary, size = geo.icons.sm)
                    Text(
                        text = stringResource(R.string.history_stat_daily),
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.textSecondary,
                    )
                }
            }
            item {
                val recent = daily.takeLast(14)
                val max = recent.maxOfOrNull { it.listenTimeSec }?.coerceAtLeast(1) ?: 1
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .oceanEntrance(2, swayDp = 0.dp),
                    verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        recent.forEach { day ->
                            val frac = (day.listenTimeSec.toFloat() / max).coerceIn(0f, 1f)
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight(0.06f + 0.94f * frac)
                                    .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(
                                                tokens.accentTeal.copy(alpha = 0.35f + 0.55f * frac),
                                                tokens.accentTeal.copy(alpha = 0.92f),
                                            ),
                                        ),
                                    ),
                            )
                        }
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(tokens.glassBorder),
                    )
                    if (recent.isNotEmpty()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = dayLabel(recent.first().key),
                                style = MaterialTheme.typography.labelSmall,
                                color = tokens.textTertiary,
                            )
                            Text(
                                text = dayLabel(recent.last().key),
                                style = MaterialTheme.typography.labelSmall,
                                color = tokens.textTertiary,
                            )
                        }
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier.oceanEntrance(3, swayDp = 0.dp, riseDp = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                ) {
                    PejvakIcon("music", null, tint = tokens.textSecondary, size = geo.icons.sm)
                    Text(
                        text = stringResource(R.string.history_stat_leaders),
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.textSecondary,
                    )
                }
            }
            if (leaders.isEmpty()) {
                item {
                    EmptyState(
                        icon = "equalizer",
                        title = stringResource(R.string.history_stat_no_leaders),
                        modifier = Modifier.oceanEntrance(4, swayDp = 0.dp),
                    )
                }
            }
            itemsIndexed(leaders, key = { _, leader -> leader.trackId }) { idx, leader ->
                LeaderRow(idx = idx, leader = leader, modifier = Modifier.oceanEntrance(4 + idx))
            }
        }
    }
}

@Composable
private fun MediaSplitCard(media: com.pejvak.app.domain.MediaBreakdown, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val total = (media.audiobookSec + media.musicSec).coerceAtLeast(1)
    GlassCard(modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            Text(
                text = stringResource(R.string.history_stat_media).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
            MediaBar(
                label = stringResource(R.string.history_stat_audiobooks),
                sec = media.audiobookSec,
                total = total,
                color = tokens.accentTeal,
            )
            MediaBar(
                label = stringResource(R.string.history_stat_music),
                sec = media.musicSec,
                total = total,
                color = tokens.accent,
            )
        }
    }
}

@Composable
private fun MediaBar(label: String, sec: Int, total: Int, color: Color) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val frac = (sec.toFloat() / total).coerceIn(0f, 1f)
    Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xxs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        ) {
            Box(
                Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(color),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatDuration(sec),
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                color = tokens.text,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(geo.radius.pill))
                .background(tokens.glassFill),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(frac)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(geo.radius.pill))
                    .background(color),
            )
        }
    }
}

@Composable
private fun LeaderRow(idx: Int, leader: TrackLeader, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = (idx + 1).toString(),
                    style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                    color = tokens.textTertiary,
                )
            }
            PaletteTile(
                contentHash = leader.contentHash,
                label = leader.title,
                size = geo.tiles.md,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    text = leader.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.history_leader_plays, leader.playCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            Text(
                text = formatDuration(leader.listenTimeSec),
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                color = tokens.text,
            )
        }
    }
}

/** "2026-02-09" → "9" — the day-of-month tick under the daily chart. */
private fun dayLabel(key: String): String = key.substringAfterLast('-').trimStart('0').ifEmpty { "1" }
