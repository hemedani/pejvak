package com.pejvak.app.ui.screens.channels

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.channelContextKey
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChannelDetailUiState(
    val slug: String = "",
    val channel: Channel? = null,
    val folders: List<ChannelPlaylist> = emptyList(),
    val allAudios: List<ChannelAudio> = emptyList(),
    val folderAudios: Map<String, List<ChannelAudio>> = emptyMap(),
    val loading: Boolean = true,
    val fromCache: Boolean = false,
    val error: String? = null,
)

/**
 * A read-only channel page (plan 07 CHAN-U02/U03). It opens the live `getChannel` page
 * (identity + folders + newest episodes), mirrors it, and plays an episode through the
 * existing [CollectionPlaybackLauncher] — a channel run reuses the `Online` origin with a
 * `channel:` context key (prompt D7/D1), so no second playback path is added. Creator
 * surfaces (upload/edit) are intentionally not here (phase A3).
 */
@HiltViewModel
class ChannelDetailViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
    private val repo: ChannelRepository,
    private val launcher: CollectionPlaybackLauncher,
) : ViewModel() {
    private val slug: String = savedStateHandle["slug"] ?: ""

    private val _state = MutableStateFlow(ChannelDetailUiState(slug = slug))
    val state: StateFlow<ChannelDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.channel == null, error = null)
        viewModelScope.launch {
            val result = repo.loadChannel(slug = slug)
            _state.value = _state.value.copy(
                channel = result.channel.takeIf { it.serverId.isNotEmpty() },
                folders = result.playlists,
                allAudios = result.audios,
                loading = false,
                fromCache = result.fromCache,
                error = result.error,
            )
            // Preload the first folder's episodes so the opening page has rows.
            result.playlists.firstOrNull()?.let { loadFolder(it.serverId) }
        }
    }

    /** Loads one folder's episodes on demand (the pager reaches a page → fetch it). */
    fun loadFolder(playlistId: String) {
        if (_state.value.folderAudios.containsKey(playlistId)) return
        val channelId = _state.value.channel?.serverId ?: return
        viewModelScope.launch {
            val audios = repo.refreshPlaylistAudios(channelId, playlistId)
            _state.value = _state.value.copy(folderAudios = _state.value.folderAudios + (playlistId to audios))
        }
    }

    /** Plays the episode at [index] within [audios] as a run over that list (prompt D1). */
    fun play(audios: List<ChannelAudio>, index: Int) {
        val channel = _state.value.channel ?: return
        val entry = audios.getOrNull(index) ?: return
        viewModelScope.launch {
            val tracks = audios.map { repo.toTrack(it, channel.name) }
            val startId = repo.toTrack(entry, channel.name).id
            PlaybackService.start(context)
            launcher.playOnline(
                collectionKey = channelContextKey(channel.serverId),
                title = channel.name,
                startTrackId = startId,
                orderedTracks = tracks,
            )
        }
    }

    fun audiosFor(folder: ChannelPlaylist): List<ChannelAudio> =
        _state.value.folderAudios[folder.serverId] ?: _state.value.allAudios.filter { it.playlistServerId == folder.serverId }
}
