package com.pejvak.app.ui.screens.discover

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.data.repository.ContextPlayRepository
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.data.repository.OnlineCollectionRepository
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.channelContextKey
import com.pejvak.app.domain.online.LANGUAGES
import com.pejvak.app.domain.online.OnlineLanguage
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.parseCollectionKey
import com.pejvak.app.domain.resumableRuns
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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

/** One channel episode on Discover's "From creators" shelf (plan 08 UX-D01). */
data class ChannelEpisodeCard(
    val audio: ChannelAudio,
    val channelName: String,
    val channelSlug: String,
)

data class DiscoverUiState(
    val page: Int = 0,
    val languageCode: String = "fa",
    val sources: List<OnlineSource> = emptyList(),
    val continueRuns: List<ContinueCard> = emptyList(),
    val favorites: List<OnlineCollection> = emptyList(),
    val channelEpisodes: List<ChannelEpisodeCard> = emptyList(),
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
    private val channels: ChannelRepository,
    private val launcher: CollectionPlaybackLauncher,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val page = MutableStateFlow(0)
    private val language = MutableStateFlow("fa")
    private val sheet = MutableStateFlow(false)

    private val _state = MutableStateFlow(DiscoverUiState())
    private var savedTitles: Map<String, String> = emptyMap()
    private var latestRuns: List<ContextPlay> = emptyList()
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    val languages: List<OnlineLanguage> = LANGUAGES

    init {
        viewModelScope.launch {
            settings.settings.collect { appSettings ->
                val code = appSettings.languageCode?.takeIf { it.isNotBlank() } ?: "fa"
                if (code != language.value) {
                    language.value = code
                    // Cold start: the saved language arrives after init, so pull its
                    // creator shelf now rather than leaving the default's cache on screen.
                    refreshEpisodes(code)
                }
            }
        }
        viewModelScope.launch {
            collections.observeLive().collect { rows ->
                savedTitles = rows.associate { it.key to it.title }
                _state.value = _state.value.copy(
                    downloadStates = rows.associate { it.key to it.downloadState },
                    continueRuns = continueCards(latestRuns),
                )
            }
        }
        viewModelScope.launch {
            val base = combine(page, language, sheet, runs.observeLive(), collections.observeFavorites()) { p, code, open, runRows, favorites ->
                latestRuns = runRows
                DiscoverUiState(
                    page = p,
                    languageCode = code,
                    sources = registry.sourcesForLanguage(code),
                    continueRuns = continueCards(runRows),
                    favorites = favorites,
                    downloadStates = _state.value.downloadStates,
                    languageSheetOpen = open,
                )
            }
            combine(base, channels.observeChannels(), channels.observeAudios()) { state, channelRows, audioRows ->
                state.copy(
                    channelEpisodes = channelEpisodes(channelRows, audioRows, state.languageCode),
                )
            }.collect { _state.value = it }
        }
        // UX-D01: pull the creator shelf for the saved language in the background.
        refreshDiscover()
    }

    /** Refreshes the channel directory, then the bounded episode slice Discover shows. */
    fun refreshDiscover() {
        viewModelScope.launch {
            channels.refreshChannels()
            channels.refreshDiscoverAudios(language.value)
        }
    }

    private fun refreshEpisodes(code: String) {
        viewModelScope.launch { channels.refreshDiscoverAudios(code) }
    }

    /** Episodes of channels serving [code], newest first, capped so the shelf stays short. */
    private fun channelEpisodes(
        channelRows: List<Channel>,
        audioRows: List<ChannelAudio>,
        code: String,
    ): List<ChannelEpisodeCard> {
        val byId = channelRows.associateBy { it.serverId }
        return audioRows.asSequence()
            .mapNotNull { audio ->
                val channel = byId[audio.channelServerId] ?: return@mapNotNull null
                ChannelEpisodeCard(audio = audio, channelName = channel.name, channelSlug = channel.slug)
            }
            .filter { card ->
                card.audio.languageCode == code || byId[card.audio.channelServerId]?.languageCode == code
            }
            .sortedByDescending { it.audio.cachedAt }
            .distinctBy { it.audio.serverId }
            .take(20)
            .toList()
    }

    /** Plays a Discover episode as a run over its channel's mirrored queue (D1/D7). */
    fun playEpisode(card: ChannelEpisodeCard) {
        viewModelScope.launch {
            val channel = channels.cachedChannels().firstOrNull { it.serverId == card.audio.channelServerId } ?: return@launch
            val queue = channels.cachedAudios(channel.serverId).ifEmpty { listOf(card.audio) }
            val tracks = queue.map { channels.toTrack(it, channel.name) }
            val startId = channels.toTrack(card.audio, channel.name).id
            PlaybackService.start(context)
            launcher.playOnline(
                collectionKey = channelContextKey(channel.serverId),
                title = channel.name,
                startTrackId = startId,
                orderedTracks = tracks,
            )
        }
    }

    fun setPage(value: Int) {
        page.value = value.coerceIn(0, 2)
    }

    fun selectLanguage(code: String) {
        language.value = code
        sheet.value = false
        viewModelScope.launch { settings.setLanguage(code) }
        refreshEpisodes(code)
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

    private fun continueCards(runRows: List<ContextPlay>): List<ContinueCard> = resumableRuns(runRows)
        .asSequence()
        .mapNotNull { run ->
            val (sourceId, collectionSlug) = parseCollectionKey(run.contextKey) ?: return@mapNotNull null
            val source = registry.source(sourceId) ?: return@mapNotNull null
            // Older runs stored the key/slug as the title; prefer the saved
            // collection's real title, then a readable slug fallback.
            val title = savedTitles[run.contextKey]
                ?: run.contextTitle.takeIf { it.isNotBlank() && it != run.contextKey && it != collectionSlug }
                ?: collectionSlug.replace('_', ' ').replaceFirstChar { it.uppercase() }
            ContinueCard(
                key = run.contextKey,
                title = title,
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
