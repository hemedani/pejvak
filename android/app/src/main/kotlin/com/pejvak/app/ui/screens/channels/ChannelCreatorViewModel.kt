package com.pejvak.app.ui.screens.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelOp
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Drives the create/edit channel form (plan 07 CHAN-C02). Holds the [ChannelDraft], the
 * inline validation, and the avatar/gallery image-upload progress. A signed-out tap is
 * routed to `AuthSheet` by the caller before this runs (prompt D4), so every write here
 * assumes a session. Refusals (over-cap, empty categories) surface as a non-blocking
 * [EditorState.notice], never a blocking dialog (prompt D6).
 */
@HiltViewModel
class ChannelCreatorViewModel @Inject constructor(
    private val repo: ChannelRepository,
    private val settings: SettingsRepository,
) : ViewModel() {
    data class EditorState(
        val draft: ChannelDraft = ChannelDraft(),
        val editingId: String? = null,
        val touched: Boolean = false,
        val busy: Boolean = false,
        val avatarBusy: Boolean = false,
        val galleryBusy: Boolean = false,
        val notice: String? = null,
        val saved: Boolean = false,
    ) {
        val isCreate: Boolean get() = editingId == null
        val nameInvalid: Boolean get() = touched && draft.name.isBlank()
        val categoriesInvalid: Boolean get() = touched && draft.categories.isEmpty()
        val canSubmit: Boolean get() = !busy && draft.isValid
    }

    private val _state = MutableStateFlow(EditorState())
    val state: StateFlow<EditorState> = _state.asStateFlow()

    fun startCreate() {
        // Seed the listener's chosen language so a channel created from the home CTA
        // immediately belongs to the shelf that offered it (plan 08 UX-H02).
        _state.value = EditorState(draft = ChannelDraft(languageCode = settings.settings.value.languageCode))
    }

    fun startEdit(channel: Channel) {
        _state.value = EditorState(draft = ChannelDraft.from(channel), editingId = channel.serverId)
    }

    fun update(transform: (ChannelDraft) -> ChannelDraft) {
        _state.value = _state.value.copy(draft = transform(_state.value.draft))
    }

    fun uploadAvatar(uri: String) {
        _state.value = _state.value.copy(avatarBusy = true, notice = null)
        viewModelScope.launch {
            when (val op = repo.uploadImage(uri)) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(
                    avatarBusy = false,
                    draft = _state.value.draft.copy(avatarUrl = op.value),
                )
                is ChannelOp.Failed -> _state.value = _state.value.copy(avatarBusy = false, notice = op.message)
            }
        }
    }

    fun uploadGalleryImage(uri: String) {
        _state.value = _state.value.copy(galleryBusy = true, notice = null)
        viewModelScope.launch {
            when (val op = repo.uploadImage(uri)) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(
                    galleryBusy = false,
                    draft = _state.value.draft.copy(gallery = _state.value.draft.gallery + op.value),
                )
                is ChannelOp.Failed -> _state.value = _state.value.copy(galleryBusy = false, notice = op.message)
            }
        }
    }

    fun removeGalleryImage(url: String) {
        _state.value = _state.value.copy(draft = _state.value.draft.copy(gallery = _state.value.draft.gallery - url))
    }

    fun submit() {
        val current = _state.value
        if (!current.draft.isValid) {
            _state.value = current.copy(touched = true)
            return
        }
        _state.value = current.copy(busy = true, notice = null)
        viewModelScope.launch {
            val op = if (current.editingId == null) {
                repo.createChannel(current.draft)
            } else {
                repo.updateChannel(current.editingId, current.draft)
            }
            when (op) {
                is ChannelOp.Ok -> _state.value = _state.value.copy(busy = false, saved = true)
                is ChannelOp.Failed -> _state.value = _state.value.copy(busy = false, notice = op.message)
            }
        }
    }

    fun dismissNotice() {
        _state.value = _state.value.copy(notice = null)
    }
}
