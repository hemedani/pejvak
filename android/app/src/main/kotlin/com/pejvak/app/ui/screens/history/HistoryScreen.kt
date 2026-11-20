package com.pejvak.app.ui.screens.history

import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.HistorySection
import com.pejvak.app.domain.HistorySort
import com.pejvak.app.domain.HistoryStretchEntry
import com.pejvak.app.domain.ListeningStats
import com.pejvak.app.domain.TrackLeader
import com.pejvak.app.domain.describeContextType
import com.pejvak.app.domain.describeDateRange
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.describeRunOutcome
import com.pejvak.app.domain.describeStretchTitle
import com.pejvak.app.domain.describeStretchTracks
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.formatTimeRange
import com.pejvak.app.domain.runProgressRatio
import com.pejvak.app.domain.shape
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.row.ActionCluster
import com.pejvak.app.ui.components.row.AiActionButton
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.HeaderSearch
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.history.DateRangeSheet
import com.pejvak.app.ui.components.history.SessionDetailSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onOpenAi: () -> Unit,
    viewModel: HistoryViewModel = hiltViewModel(),
    onOpenCollection: ((ContextPlay) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
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
                    onClick = { scope.launch { pagerState.animateScrollToPage(0) } },
                )
                GlassChip(
                    label = stringResource(R.string.history_panel_stats),
                    selected = state.panel == HistoryPanel.Stats,
                    frosted = true,
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
) {
    val geo = LocalPejvakGeometry.current
    val hasData =
        if (state.tab == HistoryTab.Sessions) state.sections.isNotEmpty() else state.filteredCollections.isNotEmpty()
    val staggerList = state.query.isBlank()

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
                        onClick = { onTab(HistoryTab.Sessions) },
                    )
                    GlassChip(
                        label = stringResource(R.string.history_tab_collections),
                        selected = state.tab == HistoryTab.Collections,
                        onClick = { onTab(HistoryTab.Collections) },
                    )
                    if (state.tab == HistoryTab.Sessions) {
                        GlassChip(
                            label = if (state.selectionMode) stringResource(R.string.action_done)
                            else stringResource(R.string.history_select),
                            selected = state.selectionMode,
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
                if (state.sections.isEmpty() && !state.loading) {
                    val emptyIdx = order++
                    item {
                        EmptyState(
                            icon = "history",
                            title = stringResource(R.string.history_empty),
                            body = stringResource(R.string.history_empty_body),
                            modifier = Modifier.oceanEntrance(emptyIdx, swayDp = 0.dp),
                        )
                    }
                }
                state.sections.forEach { section ->
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
                    order += section.data.size
                    itemsIndexed(section.data, key = { _, entry -> entry.stretch.id }) { idx, entry ->
                        StretchCard(
                            entry = entry,
                            selectionMode = state.selectionMode,
                            selected = state.selected.containsAll(entry.items.map { it.session.id }),
                            onToggle = { onToggleSelected(entry) },
                            onOpen = { onOpenStretch(entry) },
                            onDelete = { onDeleteStretch(entry) },
                            onOpenAi = onOpenAi,
                            modifier = Modifier.oceanEntrance(sectionBase + idx, staggerEnabled = staggerList),
                        )
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
                val runBase = order
                order += state.filteredCollections.size
                itemsIndexed(state.filteredCollections, key = { _, run -> run.id }) { idx, run ->
                    RunCard(
                        run = run,
                        onOpen = { onOpenRun(run) },
                        onDelete = { onDeleteRun(run) },
                        onOpenAi = onOpenAi,
                        modifier = Modifier.oceanEntrance(runBase + idx, staggerEnabled = staggerList),
                    )
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
    Row(
        modifier.fillMaxWidth().padding(top = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = section.title ?: stringResource(R.string.history_all_listens),
            style = MaterialTheme.typography.labelLarge,
            color = tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = section.data.sumOf { it.stretch.listenedSec }.let(::formatDuration),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textSecondary,
        )
    }
}

@Composable
private fun StretchCard(
    entry: HistoryStretchEntry,
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
    GlassCard(modifier = modifier.clickable(onClick = if (selectionMode) onToggle else onOpen)) {
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

@Composable
private fun RunCard(
    run: ContextPlay,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    onOpenAi: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier.clickable(onClick = onOpen)) {
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

@Composable
private fun RunDetailSheet(
    run: ContextPlay,
    onDismiss: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    com.pejvak.app.ui.components.GlassSheet(onDismiss = onDismiss, title = run.contextTitle, icon = "history") {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            Text(
                text = "${describeContextType(run.contextType)} · ${describeRunOutcome(run.shape()).label}",
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
            )
            ProgressBar(runProgressRatio(run.finishedCount, run.trackCount))
            Text(
                text = "${run.finishedCount} of ${run.trackCount} finished · ${formatDuration(run.listenedSec)}",
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.text,
            )
            Text(
                text = describeRecentWhen(run.startedAt),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
            PrimaryButton(label = stringResource(R.string.history_resume), onClick = onResume)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("delete"),
                    contentDescription = stringResource(R.string.action_delete),
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun ProgressBar(ratio: Double) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(geo.radius.pill))
            .background(tokens.glassFill),
    ) {
        Box(
            Modifier
                .fillMaxWidth(ratio.toFloat().coerceIn(0f, 1f))
                .fillMaxHeight()
                .background(tokens.accent),
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
                    Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                        StatRow(
                            stringResource(R.string.history_stat_total),
                            formatDuration(stats.totalListenTimeSec),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_sessions),
                            stats.sessionCount.toString(),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_tracks),
                            stats.trackCount.toString(),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_days),
                            stats.activeDayCount.toString(),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_average),
                            formatDuration(stats.averageSessionSec),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_longest),
                            stats.longestSessionTitle?.let {
                                "$it · ${formatDuration(stats.longestSessionSec)}"
                            } ?: formatDuration(stats.longestSessionSec),
                        )
                        StatRow(
                            stringResource(R.string.history_stat_streak),
                            "$streak · ${stringResource(R.string.history_stat_best, bestStreak)}",
                        )
                        StatRow(
                            stringResource(R.string.history_stat_media),
                            "${stringResource(R.string.history_stat_audiobooks)} ${formatDuration(media.audiobookSec)} · " +
                                    "${stringResource(R.string.history_stat_music)} ${formatDuration(media.musicSec)}",
                        )
                    }
                }
            }
            item {
                Text(
                    text = stringResource(R.string.history_stat_daily),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.textSecondary,
                    modifier = Modifier.oceanEntrance(1, swayDp = 0.dp, riseDp = 8.dp),
                )
            }
            item {
                val recent = daily.takeLast(14)
                val max = recent.maxOfOrNull { it.listenTimeSec }?.coerceAtLeast(1) ?: 1
                Row(
                    Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .oceanEntrance(2, swayDp = 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    recent.forEach { day ->
                        Box(
                            Modifier
                                .weight(1f)
                                .fillMaxHeight(day.listenTimeSec.toFloat() / max)
                                .clip(RoundedCornerShape(4.dp))
                                .background(tokens.accent),
                        )
                    }
                }
            }
            item {
                Text(
                    text = stringResource(R.string.history_stat_leaders),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.textSecondary,
                    modifier = Modifier.oceanEntrance(3, swayDp = 0.dp, riseDp = 8.dp),
                )
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
                GlassCard(Modifier.fillMaxWidth().oceanEntrance(4 + idx)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
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
                            style = MaterialTheme.typography.bodyMedium,
                            color = tokens.text,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    val tokens = LocalPejvakTokens.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(text = value, style = MaterialTheme.typography.titleSmall, color = tokens.text)
    }
}
