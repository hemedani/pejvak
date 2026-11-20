package com.pejvak.app.ui.screens.history

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.core.foldQuery
import com.pejvak.app.data.repository.ContextPlayRepository
import com.pejvak.app.data.repository.HistoryRepository
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.ANY_DATE
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.DailyListen
import com.pejvak.app.domain.DateRange
import com.pejvak.app.domain.HistoryCursor
import com.pejvak.app.domain.HistoryItem
import com.pejvak.app.domain.HistorySection
import com.pejvak.app.domain.HistorySort
import com.pejvak.app.domain.HistoryStretchEntry
import com.pejvak.app.domain.ListeningStats
import com.pejvak.app.domain.MediaBreakdown
import com.pejvak.app.domain.TrackLeader
import com.pejvak.app.domain.buildStretchSections
import com.pejvak.app.domain.computeBestStreak
import com.pejvak.app.domain.dailyListenWindow
import com.pejvak.app.domain.computeDayStreak
import com.pejvak.app.domain.computeListeningStats
import com.pejvak.app.domain.computeMediaBreakdown
import com.pejvak.app.domain.computeTrackLeaders
import com.pejvak.app.domain.groupHistoryIntoStretches
import com.pejvak.app.domain.historyCursorFor
import com.pejvak.app.domain.historySearchFields
import com.pejvak.app.domain.matchOne
import com.pejvak.app.domain.mergeHistoryPages
import com.pejvak.app.domain.rangeContains
import com.pejvak.app.domain.playbackConditions
import com.pejvak.app.domain.resumeTargetSec
import com.pejvak.app.domain.runResumeSeed
import com.pejvak.app.domain.stretchResumeTarget
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class HistoryPanel { History, Stats }
enum class HistoryTab { Sessions, Collections }

data class HistoryUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val panel: HistoryPanel = HistoryPanel.History,
    val tab: HistoryTab = HistoryTab.Sessions,
    val query: String = "",
    val sort: HistorySort = HistorySort.Newest,
    val range: DateRange = ANY_DATE,
    val entries: List<HistoryStretchEntry> = emptyList(),
    val sections: List<HistorySection<HistoryStretchEntry>> = emptyList(),
    val collections: List<ContextPlay> = emptyList(),
    val filteredCollections: List<ContextPlay> = emptyList(),
    val stats: ListeningStats = ListeningStats(),
    val leaders: List<TrackLeader> = emptyList(),
    val daily: List<DailyListen> = emptyList(),
    val streak: Int = 0,
    val bestStreak: Int = 0,
    val media: MediaBreakdown = MediaBreakdown(0, 0),
    val hasMore: Boolean = false,
    val detail: HistoryItem? = null,
    val detailRun: ContextPlay? = null,
    val selectionMode: Boolean = false,
    val selected: Set<String> = emptySet(),
)

@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val history: HistoryRepository,
    private val runs: ContextPlayRepository,
    private val library: LibraryRepository,
    private val settings: SettingsRepository,
    private val launcher: CollectionPlaybackLauncher,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(HistoryUiState())
    val state: StateFlow<HistoryUiState> = _state.asStateFlow()
    private var cursor: HistoryCursor? = null
    private var allItems: List<HistoryItem> = emptyList()
    private var deepItems: List<HistoryItem> = emptyList()

    init {
        _state.value = _state.value.copy(sort = settings.settings.value.historySort)
        viewModelScope.launch {
            runs.observeLive().collect { rows ->
                _state.value = _state.value.copy(collections = rows)
                applyQuery()
            }
        }
        reload()
    }

    fun setPanel(panel: HistoryPanel) {
        _state.value = _state.value.copy(panel = panel)
    }

    fun setTab(tab: HistoryTab) {
        _state.value = _state.value.copy(tab = tab)
    }

    fun setQuery(query: String) {
        _state.value = _state.value.copy(query = query)
        applyQuery()
    }

    fun setSort(sort: HistorySort) {
        viewModelScope.launch { settings.setHistorySort(sort) }
        _state.value = _state.value.copy(sort = sort)
        rebuildSections()
    }

    fun setRange(range: DateRange) {
        _state.value = _state.value.copy(range = range)
        reload()
    }

    fun refresh() {
        reload(refreshing = true)
    }

    fun loadMore() {
        val s = _state.value
        if (!s.hasMore || s.loading || s.query.isNotBlank()) return
        viewModelScope.launch {
            val next = history.page(cursor)
            allItems = mergeHistoryPages(allItems, next)
            cursor = historyCursorFor(allItems)
            _state.value = _state.value.copy(hasMore = next.isNotEmpty())
            applyQuery()
        }
    }

    fun toggleSelectionMode() {
        _state.value = _state.value.copy(
            selectionMode = !_state.value.selectionMode,
            selected = emptySet(),
        )
    }

    fun toggleSelected(entry: HistoryStretchEntry) {
        val ids = entry.items.map { it.session.id }.toSet()
        val selected = _state.value.selected
        _state.value = _state.value.copy(
            selected = if (selected.containsAll(ids)) selected - ids else selected + ids,
        )
    }

    fun deleteSelected() {
        val ids = _state.value.selected.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            history.deleteSessions(ids)
            _state.value = _state.value.copy(selectionMode = false, selected = emptySet())
            reload()
        }
    }

    fun openSession(item: HistoryItem) {
        _state.value = _state.value.copy(detail = item, detailRun = null)
    }

    fun openRun(run: ContextPlay) {
        _state.value = _state.value.copy(detailRun = run, detail = null)
    }

    fun dismissDetail() {
        _state.value = _state.value.copy(detail = null, detailRun = null)
    }

    fun deleteSession(item: HistoryItem) {
        viewModelScope.launch {
            history.deleteSessions(listOf(item.session.id))
            dismissDetail()
            reload()
        }
    }

    fun deleteStretch(entry: HistoryStretchEntry) {
        viewModelScope.launch {
            history.deleteSessions(entry.items.map { it.session.id })
            reload()
        }
    }

    fun deleteRun(run: ContextPlay) {
        viewModelScope.launch {
            runs.delete(run.id)
            dismissDetail()
        }
    }

    fun resumeSession(item: HistoryItem) {
        val session = item.session
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playResolved(
                item.track,
                resumeTargetSec(session),
                inherit = session.playbackConditions(),
                speed = session.playbackSpeed,
            )
        }
    }

    fun resumeStretch(entry: HistoryStretchEntry) {
        val (item, position) = stretchResumeTarget(entry)
        val session = item.session
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playResolved(
                item.track,
                position,
                inherit = session.playbackConditions(),
                speed = session.playbackSpeed,
            )
        }
    }

    fun resumeRun(run: ContextPlay) {
        val fallbackId = run.lastTrackId ?: return
        viewModelScope.launch {
            val latest = library.latestSessionForRun(run.id)
            val track = library.getTrack(latest?.trackId ?: fallbackId) ?: return@launch
            val seed = runResumeSeed(run, latest)
            PlaybackService.start(context)
            launcher.playResolved(
                track,
                run.lastPositionSec,
                inherit = seed.conditions,
                speed = seed.speed,
            )
        }
    }

    fun openCollection(run: ContextPlay) {
        _state.value = _state.value.copy(detailRun = run)
    }

    fun markdown(): String = com.pejvak.app.domain.historyMarkdown(_state.value.entries)

    private fun reload(refreshing: Boolean = false) {
        _state.value = _state.value.copy(
            loading = !refreshing && _state.value.entries.isEmpty(),
            refreshing = refreshing,
        )
        viewModelScope.launch {
            val first = history.page(null)
            cursor = historyCursorFor(first)
            allItems = first
            val deep = history.all(_state.value.range)
            val withinRange = deep.filter { rangeContains(_state.value.range, it.session.startedAt) }
            deepItems = withinRange
            val stats = computeListeningStats(withinRange)
            _state.value = _state.value.copy(
                loading = false,
                refreshing = false,
                hasMore = first.isNotEmpty(),
                stats = stats,
                leaders = computeTrackLeaders(withinRange),
                daily = dailyListenWindow(withinRange),
                streak = computeDayStreak(withinRange),
                bestStreak = computeBestStreak(withinRange),
                media = computeMediaBreakdown(withinRange),
            )
            applyQuery()
        }
    }

    private fun applyQuery() {
        val s = _state.value
        val terms = foldQuery(s.query)
        val source = if (terms.isEmpty()) allItems else deepItems
        val filtered = if (terms.isEmpty()) {
            source.filter { rangeContains(s.range, it.session.startedAt) }
        } else {
            source.filter { item ->
                rangeContains(s.range, item.session.startedAt) &&
                    historySearchFields(item).any { it.value?.let { value -> matchOne(value, terms) } != null }
            }
        }
        val entries = groupHistoryIntoStretches(filtered)
        val collections = s.collections.filter { run ->
            rangeContains(s.range, run.startedAt) &&
                (terms.isEmpty() || foldQuery(s.query).all { foldQuery(run.contextTitle).contains(it) })
        }
        _state.value = s.copy(
            entries = entries,
            sections = buildStretchSections(entries, s.sort),
            filteredCollections = collections,
            hasMore = terms.isEmpty() && s.hasMore,
        )
    }

    private fun rebuildSections() {
        _state.value = _state.value.copy(
            sections = buildStretchSections(_state.value.entries, _state.value.sort),
        )
    }
}
