package com.pejvak.app.ui.screens.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.ContextPlayRepository
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.data.repository.OnlineCollectionRepository
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.online.LANGUAGES
import com.pejvak.app.domain.online.OnlineLanguage
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.parseCollectionKey
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ContinueCard(
    val key: String,
    val title: String,
    val sourceName: String,
    val languageCode: String,
    val trackCount: Int,
    val lastIndex: Int,
    val lastTrackId: String?,
    val lastPositionSec: Int,
    val finishedCount: Int,
    val updatedAt: Long,
)

data class DiscoverUiState(
    val page: Int = 0,
    val languageCode: String = "fa",
    val sources: List<OnlineSource> = emptyList(),
    val continueRuns: List<ContinueCard> = emptyList(),
    val favorites: List<OnlineCollection> = emptyList(),
    val downloadStates: Map<String, com.pejvak.app.domain.DownloadState> = emptyMap(),
    val languageSheetOpen: Boolean = false,
)

@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val registry: OnlineRegistry,
    private val catalog: OnlineCatalogService,
    private val collections: OnlineCollectionRepository,
    private val runs: ContextPlayRepository,
    private val settings: SettingsRepository,
) : ViewModel() {
    private val page = MutableStateFlow(0)
    private val language = MutableStateFlow("fa")
    private val sheet = MutableStateFlow(false)

    private val _state = MutableStateFlow(DiscoverUiState())
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    val languages: List<OnlineLanguage> = LANGUAGES

    init {
        viewModelScope.launch {
            settings.settings.collect { appSettings ->
                val code = appSettings.languageCode?.takeIf { it.isNotBlank() } ?: "fa"
                if (code != language.value) language.value = code
            }
        }
        viewModelScope.launch {
            collections.observeLive().collect { rows ->
                _state.value = _state.value.copy(downloadStates = rows.associate { it.key to it.downloadState })
            }
        }
        viewModelScope.launch {
            combine(page, language, sheet, runs.observeLive(), collections.observeFavorites()) { p, code, open, runRows, favorites ->
                DiscoverUiState(
                    page = p,
                    languageCode = code,
                    sources = registry.sourcesForLanguage(code),
                    continueRuns = continueCards(runRows),
                    favorites = favorites,
                    downloadStates = _state.value.downloadStates,
                    languageSheetOpen = open,
                )
            }.collect { _state.value = it }
        }
    }

    fun setPage(value: Int) {
        page.value = value.coerceIn(0, 2)
    }

    fun selectLanguage(code: String) {
        language.value = code
        sheet.value = false
        viewModelScope.launch { settings.setLanguage(code) }
    }

    fun openLanguageSheet() {
        sheet.value = true
    }

    fun closeLanguageSheet() {
        sheet.value = false
    }

    fun unfavorite(key: String) {
        viewModelScope.launch { collections.setFavorite(key, false) }
    }

    fun favorite(key: String) {
        viewModelScope.launch { collections.setFavorite(key, true) }
    }

    private fun continueCards(runRows: List<ContextPlay>): List<ContinueCard> = runRows
        .asSequence()
        .filter { it.contextType == ContextType.Online && !it.completed && it.deletedAt == null }
        .sortedByDescending { it.updatedAt }
        .take(8)
        .mapNotNull { run ->
            val (sourceId, _) = parseCollectionKey(run.contextKey) ?: return@mapNotNull null
            val source = registry.source(sourceId) ?: return@mapNotNull null
            ContinueCard(
                key = run.contextKey,
                title = run.contextTitle,
                sourceName = source.name,
                languageCode = source.languageCode,
                trackCount = run.trackCount,
                lastIndex = run.lastIndex,
                lastTrackId = run.lastTrackId,
                lastPositionSec = run.lastPositionSec,
                finishedCount = run.finishedCount,
                updatedAt = run.updatedAt,
            )
        }
        .toList()
}
