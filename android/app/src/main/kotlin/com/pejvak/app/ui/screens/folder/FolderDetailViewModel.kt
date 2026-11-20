package com.pejvak.app.ui.screens.folder

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
import com.pejvak.app.domain.FolderPlayMode
import com.pejvak.app.domain.FolderPlayOptions
import com.pejvak.app.domain.FolderPlayPlan
import com.pejvak.app.domain.FolderPlayableTrack
import com.pejvak.app.domain.FolderTrackProgress
import com.pejvak.app.domain.FolderTrackState
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.buildFolderPlan
import com.pejvak.app.domain.describeFolderTrackStatus
import com.pejvak.app.domain.folderKeyFromRouteSegment
import com.pejvak.app.domain.folderNameFromKey
import com.pejvak.app.domain.folderTrackProgress
import com.pejvak.app.domain.orderCollectionRows
import com.pejvak.app.domain.toFolderPlayable
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class FolderTrackRow(
    val track: Track,
    val progress: FolderTrackProgress?,
    val status: FolderTrackState,
    /** Finalized sessions for this track — how many times it has actually been heard. */
    val playCount: Int = 0,
)

data class FolderDetailUiState(
    val loading: Boolean = true,
    val folderKey: String = "",
    val name: String = "",
    val rows: List<FolderTrackRow> = emptyList(),
    val plan: FolderPlayPlan? = null,
    val mode: FolderPlayMode = FolderPlayMode.Resume,
    val sort: CollectionSort = CollectionSort.Folder,
    val direction: SortDirection = SortDirection.Asc,
    val stats: ContextStats = ContextStats(),
    val runs: List<ContextPlay> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
)

@HiltViewModel
class FolderDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val library: LibraryRepository,
    private val playlists: PlaylistRepository,
    private val runs: ContextPlayRepository,
    private val engine: PlaybackEngine,
    private val launcher: CollectionPlaybackLauncher,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val folderKey = folderKeyFromRouteSegment(savedStateHandle["key"]) ?: ""
    private val _state = MutableStateFlow(FolderDetailUiState(folderKey = folderKey))
    val state: StateFlow<FolderDetailUiState> = _state.asStateFlow()
    private var tracks: List<Track> = emptyList()
    private var progress: Map<String, FolderTrackProgress> = emptyMap()

    init {
        load()
    }

    fun setMode(mode: FolderPlayMode) = reorder(mode = mode)

    fun setSort(sort: CollectionSort, direction: SortDirection) =
        reorder(sort = sort, direction = direction)

    /** The list reorders with every sort/mode change, from the same plan the queue uses. */
    private fun reorder(
        sort: CollectionSort = _state.value.sort,
        direction: SortDirection = _state.value.direction,
        mode: FolderPlayMode = _state.value.mode,
    ) {
        val plan = planFor(tracks, progress, mode, sort, direction)
        _state.value = _state.value.copy(
            sort = sort,
            direction = direction,
            mode = mode,
            plan = plan,
            rows = orderCollectionRows(_state.value.rows, plan.queueIds) { it.track.id },
        )
    }

    fun play(index: Int? = null) {
        val plan = _state.value.plan ?: return
        val start = index ?: plan.startIndex
        val startId = plan.queueIds.getOrNull(start) ?: return
        val startPosition = if (index == null) plan.startPositionSec else 0
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playFolder(
                folderKey = folderKey,
                folderName = _state.value.name,
                mode = _state.value.mode,
                sort = _state.value.sort,
                direction = _state.value.direction,
                startTrackId = startId,
                startPositionSec = startPosition,
                plan = plan,
            )
        }
    }

    fun saveAsPlaylist() {
        val plan = _state.value.plan ?: return
        viewModelScope.launch {
            playlists.createWithTracks(_state.value.name, plan.queueIds)
            _state.value = _state.value.copy(playlists = playlists.getAll())
        }
    }

    fun addAllToQueue() {
        val plan = _state.value.plan ?: return
        viewModelScope.launch { engine.enqueue(plan.queueIds) }
    }

    fun addAllToPlaylist(playlistId: String) {
        val plan = _state.value.plan ?: return
        viewModelScope.launch {
            playlists.addTracks(playlistId, plan.queueIds)
        }
    }

    fun createPlaylistWithAll(title: String) {
        val plan = _state.value.plan ?: return
        viewModelScope.launch {
            playlists.createWithTracks(title, plan.queueIds)
            _state.value = _state.value.copy(playlists = playlists.getAll())
        }
    }

    fun deleteRun(run: ContextPlay) {
        viewModelScope.launch {
            runs.delete(run.id)
            _state.value = _state.value.copy(
                runs = runs.getByKey(ContextType.Folder, folderKey),
                stats = runs.statsFor(ContextType.Folder, folderKey),
            )
        }
    }

    private fun load() {
        viewModelScope.launch {
            tracks = library.tracksInFolder(folderKey)
            val sessions = library.allSessions()
            progress = folderTrackProgress(tracks, sessions)
            val plays = sessions
                .filter { it.endedAt != null }
                .groupingBy { it.trackId }
                .eachCount()
            val rows = tracks.map { track ->
                FolderTrackRow(
                    track = track,
                    progress = progress[track.id],
                    status = describeFolderTrackStatus(progress[track.id], track.toFolderPlayable()),
                    playCount = plays[track.id] ?: 0,
                )
            }
            val plan = planFor(tracks, progress, FolderPlayMode.Resume)
            _state.value = FolderDetailUiState(
                loading = false,
                folderKey = folderKey,
                // The folder's own name, not the tail of its key: a tree URI key
                // percent-encodes into something unreadable, and an imported folder
                // already carries the name the user saw in the picker.
                name = tracks.firstNotNullOfOrNull { it.folderName?.takeIf(String::isNotBlank) }
                    ?: folderNameFromKey(folderKey),
                rows = orderCollectionRows(rows, plan.queueIds) { it.track.id },
                plan = plan,
                stats = runs.statsFor(ContextType.Folder, folderKey),
                runs = runs.getByKey(ContextType.Folder, folderKey),
                playlists = playlists.getAll(),
            )
        }
    }

    private fun planFor(
        tracks: List<Track>,
        progress: Map<String, FolderTrackProgress>,
        mode: FolderPlayMode,
        sort: CollectionSort = _state.value.sort,
        direction: SortDirection = _state.value.direction,
    ): FolderPlayPlan = buildFolderPlan(
        tracks.map { it.toFolderPlayable() },
        progress,
        FolderPlayOptions(mode, sort, direction),
    )
}
