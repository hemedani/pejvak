package com.pejvak.app.ui.screens.discover

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.download.DownloadService
import com.pejvak.app.data.download.DownloadSummary
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.data.repository.OnlineCollectionRepository
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.online.OnlineSourceException
import com.pejvak.app.domain.online.parseCollectionKey
import com.pejvak.app.playback.PlaybackContext
import com.pejvak.app.playback.PlaybackEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.pejvak.app.domain.ContextType

data class OnlineTrackRow(
    val track: Track,
    val positionSec: Int,
    val progressRatio: Double,
)

data class OnlineCollectionUiState(
    val key: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val sourceName: String = "",
    val artworkUrl: String? = null,
    val pageUrl: String? = null,
    val languageCode: String = "",
    val trackCount: Int = 0,
    val saved: OnlineCollection? = null,
    val tracks: List<OnlineTrackRow> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val stale: Boolean = false,
    val error: String? = null,
    val playingTrackId: String? = null,
    val download: DownloadSummary? = null,
    val downloadBusy: Boolean = false,
    val downloadError: String? = null,
)

@HiltViewModel
class OnlineCollectionViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val registry: OnlineRegistry,
    private val catalog: OnlineCatalogService,
    private val collections: OnlineCollectionRepository,
    private val library: LibraryRepository,
    private val engine: PlaybackEngine,
    private val downloads: DownloadService,
) : ViewModel() {
    private val key: String = savedStateHandle["key"] ?: ""
    private val resumeTrackId: String? = savedStateHandle["trackId"]
    private val resumePositionSec: Int = savedStateHandle["positionSec"] ?: 0
    private var resumed = false

    private val _state = MutableStateFlow(
        OnlineCollectionUiState(
            key = key,
            title = parseCollectionKey(key)?.second ?: key,
            sourceName = parseCollectionKey(key)?.first?.let { registry.source(it)?.name } ?: "",
            languageCode = parseCollectionKey(key)?.first?.let { registry.source(it)?.languageCode } ?: "",
        ),
    )
    val state: StateFlow<OnlineCollectionUiState> = _state.asStateFlow()

    init {
        load(refresh = true)
        viewModelScope.launch {
            collections.observeLive().collect { savedRows ->
                val saved = savedRows.firstOrNull { it.key == key } ?: return@collect
                val current = _state.value
                _state.value = current.copy(
                    saved = saved,
                    title = saved.title,
                    subtitle = saved.subtitle ?: current.subtitle,
                    artworkUrl = saved.artworkUrl ?: current.artworkUrl,
                    pageUrl = saved.pageUrl ?: current.pageUrl,
                    trackCount = if (saved.trackCount > 0) saved.trackCount else current.trackCount,
                )
            }
        }
        viewModelScope.launch {
            downloads.changes.collect { refreshDownload() }
        }
        viewModelScope.launch {
            library.observeSessions().collect { sessions ->
                latestSessions = sessions.filter { it.endPositionSec != null }
                    .groupBy { it.trackId }
                    .mapNotNull { (trackId, rows) -> rows.maxByOrNull { it.startedAt }?.let { trackId to it } }
                    .toMap()
                applyProgress()
            }
        }
    }

    private var latestSessions: Map<String, com.pejvak.app.domain.Session> = emptyMap()

    private fun applyProgress() {
        val current = _state.value
        if (current.tracks.isEmpty()) return
        _state.value = current.copy(
            tracks = current.tracks.map { row ->
                val end = latestSessions[row.track.id]?.endPositionSec ?: 0
                row.copy(
                    positionSec = if (end > 0) end else row.positionSec,
                    progressRatio = if (row.track.durationSec > 0) {
                        (end.toDouble() / row.track.durationSec).coerceIn(0.0, 1.0)
                    } else row.progressRatio,
                )
            },
        )
    }

    fun load(refresh: Boolean = false) {
        _state.value = _state.value.copy(loading = _state.value.tracks.isEmpty(), refreshing = refresh && _state.value.tracks.isNotEmpty(), error = null)
        viewModelScope.launch {
            try {
                val loaded = catalog.loadCollection(key, _state.value.languageCode.ifBlank { null })
                collections.markOpened(key)
                val materialised = catalog.tracksForCollection(key)
                _state.value = _state.value.copy(
                    title = loaded.info.title,
                    subtitle = loaded.info.subtitle,
                    artworkUrl = loaded.info.artworkUrl ?: loaded.tracks.firstOrNull()?.artworkUrl,
                    pageUrl = loaded.info.pageUrl,
                    languageCode = loaded.info.languageCode,
                    trackCount = loaded.tracks.size,
                    tracks = materialised.map { OnlineTrackRow(it, 0, 0.0) },
                    loading = false,
                    refreshing = false,
                    offline = false,
                    stale = false,
                )
                applyProgress()
                maybeResume()
            } catch (error: OnlineSourceException) {
                val saved = collections.get(key)
                val materialised = catalog.tracksForCollection(key)
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    offline = materialised.isEmpty(),
                    stale = materialised.isNotEmpty(),
                    tracks = if (materialised.isEmpty()) _state.value.tracks else materialised.map { OnlineTrackRow(it, 0, 0.0) },
                    error = error.message,
                    title = saved?.title ?: _state.value.title,
                    subtitle = saved?.subtitle ?: _state.value.subtitle,
                    artworkUrl = saved?.artworkUrl ?: _state.value.artworkUrl,
                    pageUrl = saved?.pageUrl ?: _state.value.pageUrl,
                )
            }
        }
    }

    fun play(index: Int = 0, positionSec: Int = 0) {
        val tracks = _state.value.tracks.map { it.track }
        val entry = tracks.getOrNull(index) ?: return
        val context = PlaybackContext(ContextType.Online, key, _state.value.title)
        viewModelScope.launch {
            _state.value = _state.value.copy(playingTrackId = entry.id)
            engine.loadAndPlay(entry, positionSec, context, tracks.map { it.id }, index)
        }
    }

    fun playTrack(trackId: String) {
        val index = _state.value.tracks.indexOfFirst { it.track.id == trackId }
        if (index < 0) return
        play(index, _state.value.tracks[index].positionSec)
    }

    fun toggleFavorite() {
        val saved = _state.value.saved
        viewModelScope.launch {
            if (saved == null) {
                val info = catalog.findCollection(key) ?: return@launch
                collections.save(info, _state.value.languageCode)
            }
            collections.setFavorite(key, _state.value.saved?.isFavorite != true)
        }
    }

    fun openPage(): String? = _state.value.pageUrl

    fun startDownload() = downloadAction { downloads.startDownload(key) }

    fun cancelDownload() = downloadAction { downloads.cancel(key) }

    fun retryDownload() = downloadAction { downloads.retry(key) }

    fun deleteDownload() = downloadAction { downloads.delete(key) }

    fun downloadSeries(title: String, seriesKey: String, trackIds: List<String>) = downloadAction {
        downloads.startSeriesDownload(key, title, seriesKey, trackIds)
    }

    private fun downloadAction(action: suspend () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(downloadBusy = true, downloadError = null)
            try {
                action()
            } catch (error: Exception) {
                _state.value = _state.value.copy(downloadError = error.message)
            } finally {
                _state.value = _state.value.copy(downloadBusy = false)
                refreshDownload()
            }
        }
    }

    private suspend fun refreshDownload() {
        _state.value = _state.value.copy(download = downloads.summary(key))
    }

    private fun maybeResume() {
        if (resumed) return
        val trackId = resumeTrackId ?: return
        resumed = true
        val index = _state.value.tracks.indexOfFirst { it.track.id == trackId }
        if (index >= 0) play(index, resumePositionSec)
    }
}
