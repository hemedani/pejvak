package com.pejvak.app.ui.screens.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ChannelRepository
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.channelIsPublic
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

data class ChannelsUiState(
    val channels: List<Channel> = emptyList(),
    val categories: List<String> = emptyList(),
    val selectedCategory: String? = null,
    val query: String = "",
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    /** True once the listener owns at least one mirrored channel (plan 09 UX-03). */
    val hasOwnChannel: Boolean = false,
)

/**
 * The Channels hub (plan 07 CHAN-U01). It renders the Room mirror immediately and pulls
 * the live public directory from the server on entry and on every filter/search/refresh —
 * the A1 acceptance is "the hub renders live data from the server." A pull failure keeps
 * the cache and surfaces as a non-blocking offline/error state (prompt D9), never a crash.
 */
@HiltViewModel
class ChannelsViewModel @Inject constructor(
    private val repo: ChannelRepository,
) : ViewModel() {
    private val category = MutableStateFlow<String?>(null)
    private val query = MutableStateFlow("")
    private val status = MutableStateFlow(Status())

    private data class Status(
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val offline: Boolean = false,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(ChannelsUiState())
    val state: StateFlow<ChannelsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(repo.observeChannels(), repo.observeMyChannels(), category, query, status) { rows, mine, selected, q, s ->
                val filtered = rows
                    .filter { channelIsPublic(it) }
                    .filter { selected == null || it.categories.contains(selected) }
                    .filter { q.isBlank() || it.name.contains(q, ignoreCase = true) || it.bio?.contains(q, ignoreCase = true) == true }
                ChannelsUiState(
                    channels = filtered,
                    categories = rows.flatMap { it.categories }.distinct().sorted(),
                    selectedCategory = selected,
                    query = q,
                    loading = s.loading,
                    refreshing = s.refreshing,
                    offline = s.offline,
                    error = s.error,
                    hasOwnChannel = mine.isNotEmpty(),
                )
            }.collect { _state.value = it }
        }
        refresh()
        // Plan 09 UX-03: mirror the creator's own channels so the header can offer "manage"
        // instead of "create". A no-op notice when signed out (refreshMyChannels guards it).
        viewModelScope.launch { repo.refreshMyChannels() }
    }

    fun refresh() {
        status.value = status.value.copy(loading = _state.value.channels.isEmpty(), refreshing = _state.value.channels.isNotEmpty(), error = null)
        viewModelScope.launch {
            val result = repo.refreshChannels(category = category.value, q = query.value.takeIf { it.isNotBlank() })
            status.value = Status(
                loading = false,
                refreshing = false,
                offline = result.error != null && _state.value.channels.isNotEmpty(),
                error = result.error,
            )
        }
    }

    fun selectCategory(value: String?) {
        category.value = value
        refresh()
    }

    fun onQueryChange(value: String) {
        query.value = value
    }

    fun submitQuery() {
        refresh()
    }

    fun clearQuery() {
        query.value = ""
        refresh()
    }
}
