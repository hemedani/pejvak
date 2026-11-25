package com.pejvak.app.ui.screens.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelOp
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.domain.channel.Channel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** The creator's own channels (plan 07 CHAN-C01): a Room-first list refreshed from the
 *  server, showing any taken-down channel with its moderation state (prompt D10). */
@HiltViewModel
class MyChannelsViewModel @Inject constructor(
    private val repo: ChannelRepository,
) : ViewModel() {
    data class State(
        val channels: List<Channel> = emptyList(),
        val loading: Boolean = true,
        val notice: String? = null,
    )

    private val notice = MutableStateFlow<String?>(null)
    private val loaded = MutableStateFlow(false)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(repo.observeMyChannels(), notice, loaded) { rows, note, didLoad ->
                State(channels = rows, loading = !didLoad && rows.isEmpty(), notice = note)
            }.collect { _state.value = it }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            when (val op = repo.refreshMyChannels()) {
                is ChannelOp.Ok -> loaded.value = true
                is ChannelOp.Failed -> {
                    loaded.value = true
                    notice.value = op.message
                }
            }
        }
    }

    fun dismissNotice() {
        notice.value = null
    }
}
