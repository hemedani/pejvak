package com.pejvak.app.ui.screens.track

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.media.AudioInspectionService
import com.pejvak.app.data.repository.AnnotationRepository
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.PlaylistRepository
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SessionSummary
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.TrackStats
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TrackDetailUiState(
    val loading: Boolean = true,
    val track: Track? = null,
    val sessions: List<Session> = emptyList(),
    val annotations: List<Annotation> = emptyList(),
    val stats: TrackStats? = null,
    val summary: SessionSummary? = null,
    val inspection: AudioInspectionService.AudioInspection? = null,
    val playlists: List<Playlist> = emptyList(),
)

@HiltViewModel
class TrackDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val library: LibraryRepository,
    private val annotations: AnnotationRepository,
    private val playlists: PlaylistRepository,
    private val inspectionService: AudioInspectionService,
    private val engine: PlaybackEngine,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val trackId: String = savedStateHandle["id"] ?: ""
    private val _state = MutableStateFlow(TrackDetailUiState())
    val state: StateFlow<TrackDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val track = library.getTrack(trackId)
            if (track == null) {
                _state.value = TrackDetailUiState(loading = false)
                return@launch
            }
            val sessions = library.sessionsForTrack(trackId)
            val notes = annotations.getForTrack(trackId)
            val inspection = withContext(Dispatchers.IO) {
                if (track.origin == Origin.Online || track.fileUri == null) {
                    null
                } else {
                    runCatching {
                        inspectionService.inspectAudioFile(
                            uri = track.fileUri,
                            fileName = track.fileName ?: track.title,
                            fileSizeBytes = track.fileSizeBytes,
                            includeArtwork = false,
                        )
                    }.getOrNull()
                }
            }
            _state.value = TrackDetailUiState(
                loading = false,
                track = track,
                sessions = sessions,
                annotations = notes,
                stats = library.trackStats(trackId),
                summary = library.sessionSummary(trackId),
                inspection = inspection,
                playlists = playlists.getAll(),
            )
            annotations.observeForTrack(trackId).collect { rows ->
                _state.value = _state.value.copy(annotations = rows)
            }
        }
    }

    fun play(positionSec: Int = 0) {
        val track = _state.value.track ?: return
        viewModelScope.launch {
            PlaybackService.start(context)
            engine.loadAndPlay(track, positionSec)
        }
    }

    fun addToPlaylist(playlistId: String) {
        viewModelScope.launch {
            playlists.addTracks(playlistId, listOf(trackId))
            _state.value = _state.value.copy(playlists = playlists.getAll())
        }
    }

    fun deleteAnnotation(annotation: Annotation) {
        viewModelScope.launch { annotations.delete(annotation.id) }
    }
}
