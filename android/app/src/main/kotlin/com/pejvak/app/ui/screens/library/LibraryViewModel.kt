package com.pejvak.app.ui.screens.library

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.core.foldQuery
import com.pejvak.app.core.foldText
import com.pejvak.app.data.media.ArtworkService
import com.pejvak.app.data.repository.ContextPlayRepository
import com.pejvak.app.data.remote.online.OnlineRegistry
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.PlaylistRepository
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.Folder
import com.pejvak.app.domain.FolderPlayMode
import com.pejvak.app.domain.FolderPlayOptions
import com.pejvak.app.domain.FolderSummary
import com.pejvak.app.domain.LibraryField
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.PlaylistSummary
import com.pejvak.app.domain.RecentPlay
import com.pejvak.app.domain.SearchEntry
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.buildFolderSummaries
import com.pejvak.app.domain.buildPlaylistSummaries
import com.pejvak.app.domain.buildRecentPlays
import com.pejvak.app.domain.createSearchIndex
import com.pejvak.app.domain.folderSearchFields
import com.pejvak.app.domain.playlistSearchFields
import com.pejvak.app.domain.recentSearchFields
import com.pejvak.app.domain.searchIndex
import com.pejvak.app.domain.trackSearchFields
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class LibraryView { Online, Tracks, Folders, Playlists, Recent }

enum class TrackOriginTab { Local, Online }

data class TrackCard(val track: Track, val noteCount: Int)

data class LibraryUiState(
    val loading: Boolean = true,
    val query: String = "",
    val view: LibraryView = LibraryView.Tracks,
    val origin: TrackOriginTab = TrackOriginTab.Local,
    val languageCode: String? = null,
    val tracks: List<TrackCard> = emptyList(),
    val folders: List<FolderSummary> = emptyList(),
    val playlists: List<PlaylistSummary> = emptyList(),
    val recents: List<RecentPlay> = emptyList(),
    val counts: Map<LibraryView, Int> = emptyMap(),
    val elsewhere: String? = null,
    val spotlight: TrackCard? = null,
    val missingCount: Int = 0,
    val localCount: Int = 0,
    val onlineCount: Int = 0,
    val hasBothOrigins: Boolean = false,
    val sources: List<OnlineSource> = emptyList(),
)

private data class Quad(
    val tracks: List<Track>,
    val folders: List<Folder>,
    val playlists: List<Playlist>,
    val sessions: List<Session>,
    val annotations: List<Annotation>,
)

private data class LibraryData(
    val tracks: List<Track>,
    val folders: List<Folder>,
    val playlists: List<Playlist>,
    val sessions: List<Session>,
    val languageCode: String?,
    val trackIndex: List<SearchEntry<TrackCard>>,
    val folderIndex: List<SearchEntry<FolderSummary>>,
    val playlistIndex: List<SearchEntry<PlaylistSummary>>,
    val recentIndex: List<SearchEntry<RecentPlay>>,
    val folderCards: List<FolderSummary>,
    val playlistCards: List<PlaylistSummary>,
    val recentPlays: List<RecentPlay>,
    val cards: List<TrackCard>,
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val library: LibraryRepository,
    private val playlists: PlaylistRepository,
    private val registry: OnlineRegistry,
    private val runs: ContextPlayRepository,
    private val settings: SettingsRepository,
    private val engine: PlaybackEngine,
    private val launcher: CollectionPlaybackLauncher,
    private val artwork: ArtworkService,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private var backfillStarted = false

    /** Idle-scheduled, bounded per visit; streams are skipped in the query itself. */
    fun backfillArtwork() {
        if (backfillStarted) return
        backfillStarted = true
        viewModelScope.launch { artwork.backfillArtwork(limit = 8) }
    }

    private val query = MutableStateFlow("")
    private val view = MutableStateFlow(LibraryView.Tracks)
    private val origin = MutableStateFlow(TrackOriginTab.Local)
    private var lastSessions: List<Session> = emptyList()
    private var viewChosen = false

    init {
        // A listener who has already picked an online language lands on the
        // Online directory; the Track list is what you choose when you have none.
        viewModelScope.launch {
            settings.settings.first { it.languageCode != null }
            if (!viewChosen) view.value = LibraryView.Online
        }
    }

    private val core = combine(
        library.observeTracks(),
        library.observeFolders(),
        playlists.observeLive(),
        library.observeSessions(),
        library.observeAnnotations(),
    ) { tracks, folders, playlistRows, sessions, annotations ->
        Quad(tracks, folders, playlistRows, sessions, annotations)
    }

    private val data = combine(core, runs.observeLive(), settings.settings) { quad, runRows, appSettings ->
        buildData(
            quad.tracks,
            quad.folders,
            quad.playlists,
            quad.sessions,
            quad.annotations,
            runRows,
            appSettings.languageCode,
        )
    }

    val state: StateFlow<LibraryUiState> = combine(data, query, view, origin) { data, q, v, o ->
        reduce(data, q, v, o)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LibraryUiState())

    private var lastData: LibraryData? = null

    fun setQuery(value: String) {
        query.value = value
    }

    fun setView(value: LibraryView) {
        viewChosen = true
        view.value = value
    }

    fun setOrigin(value: TrackOriginTab) {
        origin.value = value
    }

    fun setLanguage(code: String) {
        viewModelScope.launch { settings.setLanguage(code) }
    }

    fun playTrack(track: Track, queue: List<Track> = listOf(track), index: Int = 0) {
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playResolved(track, fallbackQueue = queue.map { it.id }, fallbackIndex = index)
        }
    }

    fun playFolder(summary: FolderSummary, mode: FolderPlayMode = FolderPlayMode.Resume) {
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playFolder(
                folderKey = summary.folder.key,
                folderName = summary.folder.name,
                mode = mode,
            )
        }
    }

    fun playPlaylist(summary: PlaylistSummary, index: Int = 0) {
        viewModelScope.launch {
            val tracks = playlists.tracks(summary.playlist)
            val entry = tracks.getOrNull(index) ?: return@launch
            PlaybackService.start(context)
            engine.loadAndPlay(
                entry,
                0,
                playlists.contextFor(summary.playlist).let {
                    com.pejvak.app.playback.PlaybackContext(it.type, it.key, it.title, it.sort, it.direction)
                },
                tracks.map { it.id },
                index,
            )
        }
    }

    fun playRecent(play: RecentPlay) {
        when (play) {
            is RecentPlay.FolderPlay -> playFolder(FolderSummary(play.folder, 0, 0, 0, 0, 0))
            is RecentPlay.PlaylistPlay -> playPlaylist(PlaylistSummary(play.playlist, 0, 0))
            is RecentPlay.TrackPlay -> playTrack(play.track)
        }
    }

    fun createPlaylist(title: String) {
        viewModelScope.launch { runCatching { playlists.create(title) } }
    }

    fun deletePlaylist(id: String) {
        viewModelScope.launch { playlists.delete(id) }
    }

    fun addToPlaylist(trackIds: List<String>, playlistId: String) {
        viewModelScope.launch { playlists.addTracks(playlistId, trackIds) }
    }

    fun availablePlaylists(): List<Playlist> = lastData?.playlists.orEmpty()

    private fun buildData(
        tracks: List<Track>,
        folders: List<Folder>,
        playlistRows: List<Playlist>,
        sessions: List<Session>,
        annotations: List<Annotation>,
        runRows: List<ContextPlay>,
        languageCode: String?,
    ): LibraryData {
        lastSessions = sessions
        val noteCounts = annotations.groupingBy { it.trackId }.eachCount()
        val cards = tracks.map { TrackCard(it, noteCounts[it.id] ?: 0) }
        val folderCards = buildFolderSummaries(tracks, folders, sessions, runRows)
        val playlistCards = buildPlaylistSummaries(playlistRows, tracks)
        val recentPlays = buildRecentPlays(
            sessions.filter { it.endedAt != null },
            folders,
            playlistRows,
            tracks,
            60,
        )
        return LibraryData(
            tracks = tracks,
            folders = folders,
            playlists = playlistRows,
            sessions = sessions,
            languageCode = languageCode,
            trackIndex = createSearchIndex(cards, LibraryField.Title) { trackSearchFields(it.track) },
            folderIndex = createSearchIndex(folderCards, LibraryField.Title) { folderSearchFields(it.folder) },
            playlistIndex = createSearchIndex(playlistCards, LibraryField.Title) { playlistSearchFields(it.playlist) },
            recentIndex = createSearchIndex(recentPlays, LibraryField.Title) { recentSearchFields(it) },
            folderCards = folderCards,
            playlistCards = playlistCards,
            recentPlays = recentPlays,
            cards = cards,
        ).also { lastData = it }
    }

    private fun reduce(
        data: LibraryData,
        q: String,
        v: LibraryView,
        o: TrackOriginTab,
    ): LibraryUiState {
        val terms = foldQuery(q)
        val trackHits = if (terms.isEmpty()) data.cards else searchIndex(data.trackIndex, terms).map { it.item }
        val folderHits = if (terms.isEmpty()) data.folderCards else searchIndex(data.folderIndex, terms).map { it.item }
        val playlistHits = if (terms.isEmpty()) data.playlistCards else searchIndex(data.playlistIndex, terms).map { it.item }
        val recentHits = if (terms.isEmpty()) data.recentPlays.take(12) else searchIndex(data.recentIndex, terms).map { it.item }

        val local = trackHits.filter { it.track.origin != Origin.Online }
        val online = trackHits.filter { it.track.origin == Origin.Online }
        val hasBoth = local.isNotEmpty() && online.isNotEmpty()
        val chosenOrigin = when {
            !hasBoth -> if (online.isNotEmpty()) TrackOriginTab.Online else TrackOriginTab.Local
            else -> o
        }
        val visibleTracks = if (chosenOrigin == TrackOriginTab.Online) online else local

        // The Online view is a provider directory, like RN's: a language first,
        // then the sources that actually serve it. The search field filters it too.
        val allSources = data.languageCode?.let { registry.sourcesForLanguage(it) }.orEmpty()
        val visibleSources = if (terms.isEmpty()) allSources else allSources.filter { source ->
            val haystack = foldText("${source.name} ${source.nativeName} ${source.description}")
            terms.all { haystack.contains(it) }
        }

        val counts = mapOf(
            LibraryView.Online to visibleSources.size,
            LibraryView.Tracks to trackHits.size,
            LibraryView.Folders to folderHits.size,
            LibraryView.Playlists to playlistHits.size,
            LibraryView.Recent to recentHits.size,
        )
        val currentCount = counts[v] ?: 0
        val elsewhereView = if (terms.isNotEmpty() && currentCount == 0) {
            LibraryView.entries.firstOrNull { it != v && (counts[it] ?: 0) > 0 }
        } else {
            null
        }
        val elsewhere = elsewhereView?.let { "Also ${counts[it]} under ${label(it)}" }
        val spotlight = if (terms.isEmpty()) {
            visibleTracks.filter { it.track.lastPlayedAt != null }.maxByOrNull { it.track.lastPlayedAt!! }
        } else {
            null
        }
        return LibraryUiState(
            loading = false,
            query = q,
            view = v,
            origin = chosenOrigin,
            languageCode = data.languageCode,
            tracks = visibleTracks,
            folders = folderHits,
            playlists = playlistHits,
            recents = recentHits,
            counts = counts,
            elsewhere = elsewhere,
            spotlight = spotlight,
            missingCount = data.tracks.count { it.availability == Availability.Missing },
            localCount = local.size,
            onlineCount = online.size,
            hasBothOrigins = hasBoth,
            sources = visibleSources,
        )
    }

    private fun label(view: LibraryView): String = when (view) {
        LibraryView.Online -> "Online"
        LibraryView.Tracks -> "Tracks"
        LibraryView.Folders -> "Folders"
        LibraryView.Playlists -> "Playlists"
        LibraryView.Recent -> "Recent"
    }
}
