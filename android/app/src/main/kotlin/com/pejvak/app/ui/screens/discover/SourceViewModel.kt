package com.pejvak.app.ui.screens.discover

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.download.DownloadService
import com.pejvak.app.data.download.DownloadSummary
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.data.repository.OnlineCollectionRepository
import com.pejvak.app.domain.online.OnlineCollectionInfo
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.OnlineSourceException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SourceUiState(
    val source: OnlineSource? = null,
    val collections: List<OnlineCollectionInfo> = emptyList(),
    val favorites: Set<String> = emptySet(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val fromCache: Boolean = false,
    val error: String? = null,
    val downloads: Map<String, DownloadSummary> = emptyMap(),
    val downloadError: String? = null,
)

@HiltViewModel
class SourceViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val registry: OnlineRegistry,
    private val catalog: OnlineCatalogService,
    private val collections: OnlineCollectionRepository,
    private val downloads: DownloadService,
) : ViewModel() {
    private val sourceId: String = savedStateHandle["sourceId"] ?: ""
    private val _state = MutableStateFlow(SourceUiState(source = registry.source(sourceId)))
    val state: StateFlow<SourceUiState> = _state.asStateFlow()

    init {
        load(refresh = false)
        viewModelScope.launch {
            collections.observeFavorites().collect { rows ->
                _state.value = _state.value.copy(favorites = rows.map { it.key }.toSet())
            }
        }
        viewModelScope.launch {
            downloads.changes.collect { refreshDownloadSummaries() }
        }
    }

    private suspend fun refreshDownloadSummaries() {
        val keys = _state.value.collections.map { it.key }
        if (keys.isEmpty()) return
        val map = mutableMapOf<String, DownloadSummary>()
        for (key in keys) map[key] = downloads.summary(key)
        _state.value = _state.value.copy(downloads = map)
    }

    fun load(refresh: Boolean = true) {
        val source = registry.source(sourceId) ?: return
        _state.value = _state.value.copy(
            loading = _state.value.collections.isEmpty(),
            refreshing = refresh && _state.value.collections.isNotEmpty(),
            error = null,
        )
        viewModelScope.launch {
            try {
                val result = catalog.browse(sourceId, source.languageCode)
                _state.value = _state.value.copy(
                    collections = result.collections,
                    fromCache = result.fromCache,
                    loading = false,
                    refreshing = false,
                    error = result.error?.message,
                )
                refreshDownloadSummaries()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    error = error.message ?: "The source could not be loaded.",
                )
            }
        }
    }

    fun download(info: OnlineCollectionInfo) {
        val source = registry.source(info.sourceId) ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(downloadError = null)
            try {
                if (collections.get(info.key) == null) collections.save(info, source.languageCode)
                downloads.startDownload(info.key)
            } catch (error: Exception) {
                _state.value = _state.value.copy(downloadError = error.message)
            }
        }
    }

    fun toggleFavorite(info: OnlineCollectionInfo) {
        val source = registry.source(info.sourceId) ?: return
        viewModelScope.launch {
            val saved = collections.get(info.key)
            if (saved == null) collections.save(info, source.languageCode)
            val next = saved?.isFavorite != true
            collections.setFavorite(info.key, next)
        }
    }
}

/** Language screen: the sources that actually serve a language (ON-12). */
@HiltViewModel
class LanguageSourcesViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val registry: OnlineRegistry,
) : ViewModel() {
    private val languageCode: String = savedStateHandle["code"] ?: "fa"
    private val _sources = MutableStateFlow(registry.sourcesForLanguage(languageCode))
    val sources: StateFlow<List<OnlineSource>> = _sources.asStateFlow()
    val code: String = languageCode

    fun refresh() {
        _sources.value = registry.sourcesForLanguage(languageCode)
    }
}

private fun OnlineSourceException.userMessage(): String = message ?: "Something went wrong"
