package com.pejvak.app.ui.screens.channels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelOp
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.PlaylistDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Manages one owned channel (plan 07 CHAN-C03/C04/C05/C06): folders (add/rename/reorder/
 * delete), episodes (upload → publish, edit, move, delete), and the leaf-first channel
 * delete. Every write is a direct act call through [ChannelRepository] (never the offline
 * batch — prompt D2), and a refusal (over-cap, validation) lands in [ManageState.notice] as
 * a non-blocking message (prompt D6).
 */
@HiltViewModel
class ChannelManageViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repo: ChannelRepository,
) : ViewModel() {
    val channelId: String = savedStateHandle["channelId"] ?: ""

    data class ManageState(
        val channel: Channel? = null,
        val folders: List<ChannelPlaylist> = emptyList(),
        val episodes: List<ChannelAudio> = emptyList(),
        val loading: Boolean = true,
        val busy: Boolean = false,
        val notice: String? = null,
        val deleted: Boolean = false,
    )

    private val _state = MutableStateFlow(ManageState())
    val state: StateFlow<ManageState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.channel == null)
            val result = repo.loadChannel(channelId = channelId)
            val episodes = result.audios.ifEmpty { repo.cachedAudios(channelId) }
            _state.value = _state.value.copy(
                channel = result.channel.takeIf { it.serverId.isNotEmpty() },
                folders = result.playlists,
                episodes = episodes,
                loading = false,
                notice = result.error,
            )
            // Load each folder's full episode list so management sees everything, not the preview.
            result.playlists.forEach { folder ->
                val audios = repo.refreshPlaylistAudios(channelId, folder.serverId)
                _state.value = _state.value.copy(
                    episodes = (_state.value.episodes.filterNot { it.playlistServerId == folder.serverId } + audios)
                        .distinctBy { it.serverId },
                )
            }
        }
    }

    fun addFolder(draft: PlaylistDraft) {
        if (!draft.isValid) return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.createPlaylist(channelId, draft)) {
                is ChannelOp.Ok -> {
                    _state.value = _state.value.copy(busy = false, folders = _state.value.folders + op.value)
                    load()
                }
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun renameFolder(playlistId: String, draft: PlaylistDraft) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.updatePlaylist(playlistId, channelId, draft)) {
                is ChannelOp.Ok -> {
                    _state.value = _state.value.copy(
                        busy = false,
                        folders = _state.value.folders.map { if (it.serverId == playlistId) op.value else it },
                    )
                }
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun deleteFolder(playlistId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.deletePlaylist(playlistId, channelId)) {
                is ChannelOp.Ok -> load()
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    /** Reorders a folder up or down by swapping `sortOrder` with its neighbour. */
    fun moveFolder(playlistId: String, up: Boolean) {
        val folders = _state.value.folders.sortedBy { it.sortOrder }
        val index = folders.indexOfFirst { it.serverId == playlistId }
        val target = if (up) index - 1 else index + 1
        if (index < 0 || target < 0 || target >= folders.size) return
        val a = folders[index]
        val b = folders[target]
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            val first = repo.updatePlaylist(a.serverId, channelId, PlaylistDraft(title = a.title, category = a.category ?: "", sortOrder = b.sortOrder))
            val second = repo.updatePlaylist(b.serverId, channelId, PlaylistDraft(title = b.title, category = b.category ?: "", sortOrder = a.sortOrder))
            _state.value = _state.value.copy(busy = false)
            if (first is ChannelOp.Failed) _state.value = _state.value.copy(notice = first.message)
            if (second is ChannelOp.Failed) _state.value = _state.value.copy(notice = second.message)
            load()
        }
    }

    fun uploadEpisode(playlistId: String, uri: String, draft: EpisodeDraft, onProgress: (ChannelRepository.UploadProgress) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.uploadAndPublish(playlistId, channelId, uri, draft, onProgress)) {
                is ChannelOp.Ok -> {
                    _state.value = _state.value.copy(busy = false, episodes = _state.value.episodes + op.value)
                    load()
                }
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun editEpisode(audioId: String, draft: EpisodeDraft) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.updateEpisode(audioId, channelId, draft)) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(
                    busy = false,
                    episodes = _state.value.episodes.map { if (it.serverId == audioId) op.value else it },
                )
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun moveEpisode(audioId: String, targetPlaylistId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.moveEpisode(audioId, targetPlaylistId, channelId)) {
                is ChannelOp.Ok -> load()
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun deleteEpisode(audioId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.deleteEpisode(audioId, channelId)) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(busy = false, episodes = _state.value.episodes.filterNot { it.serverId == audioId })
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun deleteChannel() {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, notice = null)
            when (val op = repo.deleteChannel(channelId)) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(busy = false, deleted = true)
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun dismissNotice() {
        _state.value = _state.value.copy(notice = null)
    }
}
