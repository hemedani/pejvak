package com.pejvak.app.ui.screens.channels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelOp
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.parseTagList
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The full-screen upload page (plan 08 UX-C02, overhauled by plan 09 UX-04). The owner flagged
 * that the upload `GlassSheet` was swiped away and the typed draft lost — a route keeps it across
 * navigation. Holds the picked file + the episode draft + live upload progress, and the folder /
 * category / language / order the creator chooses through the new `SelectField`s.
 */
@HiltViewModel
class ChannelUploadViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repo: ChannelRepository,
) : ViewModel() {
    val channelId: String = savedStateHandle["channelId"] ?: ""
    val defaultPlaylistId: String? = savedStateHandle.get<String>("playlistId")?.takeIf { it.isNotBlank() && it != "none" }

    data class UploadState(
        val folders: List<ChannelPlaylist> = emptyList(),
        val selectedFolder: String? = null,
        val pickedUri: String? = null,
        val fileName: String? = null,
        val draft: EpisodeDraft = EpisodeDraft(),
        val tagsInput: String = "",
        /** The creator's chosen order within the folder; blank = append to the end (server default). */
        val positionInput: String = "",
        val progress: Float = -1f,
        val busy: Boolean = false,
        val notice: String? = null,
        val published: Boolean = false,
        val loading: Boolean = true,
    ) {
        val positionError: String? get() =
            positionInput.takeIf { it.isNotBlank() && it.toIntOrNull() == null }?.let { "Enter a number, or leave it blank." }

        val canPublish: Boolean
            get() = pickedUri != null && selectedFolder != null && draft.isValid && positionError == null && !busy
    }

    private val _state = MutableStateFlow(
        UploadState(selectedFolder = defaultPlaylistId),
    )
    val state: StateFlow<UploadState> = _state.asStateFlow()

    init {
        loadFolders()
    }

    fun loadFolders() {
        viewModelScope.launch {
            val detail = repo.loadChannel(channelId = channelId)
            val folders = detail.playlists.sortedBy { it.sortOrder }
            val selected = _state.value.selectedFolder ?: folders.firstOrNull()?.serverId
            _state.value = _state.value.copy(
                folders = folders,
                selectedFolder = selected,
                loading = false,
                notice = detail.error,
            )
        }
    }

    fun pickFile(uri: String, name: String) {
        val current = _state.value
        _state.value = current.copy(
            pickedUri = uri,
            fileName = name,
            draft = current.draft.copy(title = current.draft.title.ifBlank { name.substringBeforeLast('.').takeIf { it.isNotBlank() }.orEmpty() }),
        )
    }

    fun selectFolder(id: String) {
        _state.value = _state.value.copy(selectedFolder = id)
    }

    fun update(transform: (EpisodeDraft) -> EpisodeDraft) {
        _state.value = _state.value.copy(draft = transform(_state.value.draft))
    }

    fun setPosition(value: String) {
        _state.value = _state.value.copy(positionInput = value)
    }

    fun setTagsInput(value: String) {
        _state.value = _state.value.copy(tagsInput = value, draft = _state.value.draft.copy(tags = parseTagList(value)))
    }

    fun publish() {
        val s = _state.value
        val folder = s.selectedFolder ?: return
        val uri = s.pickedUri ?: return
        if (!s.draft.isValid || s.positionError != null) return
        // A blank order leaves `position` null, so the server appends after the folder's last
        // episode (publishChannelAudio: `position ?? folder.audioCount`) — the default sort order.
        val finalDraft = s.draft.copy(position = s.positionInput.toIntOrNull())
        _state.value = s.copy(busy = true, notice = null, progress = 0f)
        viewModelScope.launch {
            when (val op = repo.uploadAndPublish(folder, channelId, uri, finalDraft) { p ->
                _state.value = _state.value.copy(progress = if (p.total > 0) (p.sent.toFloat() / p.total).coerceIn(0f, 1f) else _state.value.progress)
            }) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(busy = false, published = true)
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun dismissNotice() {
        _state.value = _state.value.copy(notice = null)
    }
}
