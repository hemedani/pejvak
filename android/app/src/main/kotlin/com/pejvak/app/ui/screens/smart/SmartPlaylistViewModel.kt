package com.pejvak.app.ui.screens.smart

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.PlaylistRepository
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.DEFAULT_COMMUTE_BUDGET_SEC
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.SmartContext
import com.pejvak.app.domain.SmartPlaylist
import com.pejvak.app.domain.SmartPlaylistOptions
import com.pejvak.app.domain.SmartRuleId
import com.pejvak.app.domain.buildSmartPlaylist
import com.pejvak.app.domain.ruleFor
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SmartPlaylistUiState(
    val loading: Boolean = true,
    val ruleId: SmartRuleId = SmartRuleId.Continue,
    val playlist: SmartPlaylist? = null,
    val budgetSec: Int = DEFAULT_COMMUTE_BUDGET_SEC,
    val saved: Boolean = false,
    val playlists: List<Playlist> = emptyList(),
)

@HiltViewModel
class SmartPlaylistViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val library: LibraryRepository,
    private val playlists: PlaylistRepository,
    private val engine: PlaybackEngine,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val ruleId: SmartRuleId = SmartRuleId.from(savedStateHandle["rule"]) ?: SmartRuleId.Continue
    private val _state = MutableStateFlow(SmartPlaylistUiState(ruleId = ruleId))
    val state: StateFlow<SmartPlaylistUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun setBudget(budgetSec: Int) {
        _state.value = _state.value.copy(budgetSec = budgetSec)
        refresh()
    }

    fun play(index: Int = 0) {
        val playlist = _state.value.playlist ?: return
        val entry = playlist.picks.getOrNull(index)?.track ?: return
        val ids = playlist.picks.map { it.track.id }
        viewModelScope.launch {
            PlaybackService.start(context)
            engine.loadAndPlay(
                entry,
                0,
                com.pejvak.app.playback.PlaybackContext(
                    ContextType.Playlist,
                    "smart:${ruleId.wire}",
                    ruleFor(ruleId).title,
                    CollectionSort.Smart,
                ),
                ids,
                index,
            )
        }
    }

    fun saveAsPlaylist() {
        val playlist = _state.value.playlist ?: return
        if (playlist.picks.isEmpty()) return
        viewModelScope.launch {
            playlists.createWithTracks(ruleFor(ruleId).title, playlist.picks.map { it.track.id })
            _state.value = _state.value.copy(saved = true, playlists = playlists.getAll())
        }
    }

    fun addAllToPlaylist(playlistId: String) {
        val playlist = _state.value.playlist ?: return
        viewModelScope.launch {
            playlists.addTracks(playlistId, playlist.picks.map { it.track.id })
        }
    }

    fun createPlaylistWithAll(title: String) {
        val playlist = _state.value.playlist ?: return
        viewModelScope.launch {
            playlists.createWithTracks(title, playlist.picks.map { it.track.id })
            _state.value = _state.value.copy(playlists = playlists.getAll())
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            val tracks = library.allTracks()
            val sessions = library.allSessions()
            val counts = library.annotationCounts(tracks.map { it.id })
            val playlist = buildSmartPlaylist(
                ruleId,
                SmartContext(tracks, sessions, counts, System.currentTimeMillis()),
                SmartPlaylistOptions(
                    budgetSec = if (ruleId == SmartRuleId.Commute) _state.value.budgetSec else null,
                ),
            )
            _state.value = _state.value.copy(
                loading = false,
                playlist = playlist,
                playlists = playlists.getAll(),
            )
        }
    }
}
