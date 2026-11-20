package com.pejvak.app.ui.screens.playlist

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.ContextPlayRepository
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.PlaylistRepository
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextStats
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.FolderTrackProgress
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.folderTrackProgress
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlaylistTrackRow(
    val track: Track,
    val progress: FolderTrackProgress?,
)

data class PlaylistDetailUiState(
    val loading: Boolean = true,
    val playlist: Playlist? = null,
    val rows: List<PlaylistTrackRow> = emptyList(),
    val stats: ContextStats = ContextStats(),
    val allTracks: List<Track> = emptyList(),
    val editing: Boolean = false,
    val deleted: Boolean = false,
    val runs: List<ContextPlay> = emptyList(),
)

@HiltViewModel
class PlaylistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val playlists: PlaylistRepository,
    private val library: LibraryRepository,
    private val runs: ContextPlayRepository,
    private val engine: PlaybackEngine,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val playlistId: String = savedStateHandle["id"] ?: ""
    private val _state = MutableStateFlow(PlaylistDetailUiState())
    val state: StateFlow<PlaylistDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun toggleEditing() {
        _state.value = _state.value.copy(editing = !_state.value.editing)
    }

    fun play(index: Int = 0) {
        val playlist = _state.value.playlist ?: return
        val ids = playlist.items.sortedBy { it.order }.map { it.trackId }
        val entry = _state.value.rows.getOrNull(index)?.track ?: return
        viewModelScope.launch {
            PlaybackService.start(context)
            engine.loadAndPlay(
                entry,
                0,
                com.pejvak.app.playback.PlaybackContext(
                    ContextType.Playlist,
                    playlist.id,
                    playlist.title,
                    CollectionSort.Manual,
                ),
                ids,
                index,
            )
        }
    }

    fun rename(title: String) {
        viewModelScope.launch {
            playlists.rename(playlistId, title)
            load()
        }
    }

    fun delete() {
        viewModelScope.launch {
            playlists.delete(playlistId)
            _state.value = _state.value.copy(deleted = true)
        }
    }

    fun addTracks(ids: List<String>) {
        viewModelScope.launch {
            playlists.addTracks(playlistId, ids)
            load()
        }
    }

    fun removeTrack(trackId: String) {
        viewModelScope.launch {
            playlists.removeTracks(playlistId, listOf(trackId))
            load()
        }
    }

    fun deleteRun(run: ContextPlay) {
        viewModelScope.launch {
            runs.delete(run.id)
            _state.value = _state.value.copy(runs = runs.getByKey(ContextType.Playlist, playlistId))
        }
    }

    fun move(from: Int, to: Int) {
        viewModelScope.launch {
            playlists.moveTrack(playlistId, from, to)
            load()
        }
    }

    private fun load() {
        viewModelScope.launch {
            val playlist = playlists.get(playlistId)
            if (playlist == null) {
                _state.value = _state.value.copy(loading = false, deleted = true)
                return@launch
            }
            val tracks = playlists.tracks(playlist)
            val sessions = library.allSessions()
            val progress = folderTrackProgress(tracks, sessions)
            _state.value = _state.value.copy(
                loading = false,
                playlist = playlist,
                rows = tracks.map { PlaylistTrackRow(it, progress[it.id]) },
                stats = runs.statsFor(ContextType.Playlist, playlist.id),
                allTracks = library.allTracks(),
                runs = runs.getByKey(ContextType.Playlist, playlist.id),
            )
        }
    }
}
