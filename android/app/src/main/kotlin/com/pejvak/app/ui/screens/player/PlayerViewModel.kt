package com.pejvak.app.ui.screens.player

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.media.WaveformAnalyzer
import com.pejvak.app.data.repository.AnnotationRepository
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.AudioEnhancerSettings
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.collectionSortOptions
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.clampSeconds
import com.pejvak.app.domain.isWaiting
import com.pejvak.app.domain.nextSpeed
import com.pejvak.app.playback.AudioEffectsController
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.EnhancerStatus
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlayerState
import com.pejvak.app.playback.PlaybackService
import com.pejvak.app.ui.components.NowPlayingUi
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val engine: PlaybackEngine,
    private val library: LibraryRepository,
    private val annotations: AnnotationRepository,
    private val waveforms: WaveformAnalyzer,
    private val effects: AudioEffectsController,
    private val launcher: CollectionPlaybackLauncher,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val player = engine.state

    val sortOptions: StateFlow<List<CollectionSort>> = engine.state
        .map { state -> state.context?.type?.let { collectionSortOptions(it) } ?: emptyList() }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val frame: StateFlow<PlayerState> = engine.state
        .map { it.copy(positionSec = 0, listenedSec = 0) }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlayerState())

    val position: StateFlow<Int> = engine.state
        .map { it.positionSec }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val listened: StateFlow<Int> = engine.state
        .map { it.listenedSec }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val mini: StateFlow<NowPlayingUi?> = engine.state
        .map { s ->
            if (!s.hasTrack) null
            else NowPlayingUi(s.title, s.artist, s.isPlaying, s.artworkUrl, s.contentHash, isWaiting(s.phase))
        }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The mini-player's wave, separated from [mini] so a once-a-second position
     *  tick never recomposes the dock: only the leaf wave collects it. */
    val miniProgress: StateFlow<Float> = engine.state
        .map { s ->
            if (s.durationSec > 0) (s.positionSec.toFloat() / s.durationSec).coerceIn(0f, 1f) else 0f
        }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0f)

    val openPlayer = engine.openPlayer

    val queue: StateFlow<List<Track>> = engine.state
        .map { it.queue }
        .distinctUntilChanged()
        .mapLatest { ids -> library.getTracks(ids) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * The current track's loudness strip for the scrubber. Only collected while the
     * player is on screen, so decoding never runs for a track nobody is looking at;
     * leaving the player cancels the analysis and the cache keeps what finished.
     */
    val waveform: StateFlow<FloatArray?> = engine.state
        .map { it.trackId }
        .distinctUntilChanged()
        .flatMapLatest { id ->
            if (id == null) {
                flowOf<FloatArray?>(null)
            } else {
                flow<FloatArray?> {
                    val track = library.track(id)
                    if (track == null) emit(null) else emitAll(waveforms.waveform(track))
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val notes: StateFlow<List<Annotation>> = engine.state
        .map { it.trackId }
        .distinctUntilChanged()
        .flatMapLatest { id ->
            if (id == null) flowOf(emptyList())
            else annotations.observeForTrack(id)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _sleepRemainingSec = MutableStateFlow<Int?>(null)
    val sleepRemainingSec: StateFlow<Int?> = _sleepRemainingSec.asStateFlow()
    private var sleepTicker: Job? = null

    val enhancer: StateFlow<AudioEnhancerSettings> = effects.state
        .map { it.enhancer }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AudioEnhancerSettings())

    val toneId: StateFlow<String> = effects.state
        .map { it.toneId }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "room")

    val toneLevel: StateFlow<Int> = effects.state
        .map { it.toneLevel }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val volume: StateFlow<Int> = effects.state
        .map { it.volume }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 100)

    val enhancerStatus: StateFlow<EnhancerStatus> = effects.enhancerStatus

    init {
        if (engine.sleepTimer.isActive) startSleepTicker()
    }

    fun toggle() {
        // The media service may have stopped itself (e.g. Bluetooth disconnect + background
        // timeout) while the engine singleton kept the track; bring it back so the resume
        // re-loads into a live player instead of no-op'ing against a null one.
        PlaybackService.start(context)
        viewModelScope.launch { engine.togglePlayPause() }
    }

    fun next() {
        PlaybackService.start(context)
        viewModelScope.launch { engine.next() }
    }

    fun previous() {
        PlaybackService.start(context)
        viewModelScope.launch { engine.previous() }
    }

    /** Closes the player: finalizes the session, clears the mini-player, tears down the service. */
    fun stop() {
        viewModelScope.launch { engine.stop() }
        PlaybackService.stop(context)
    }

    fun seekTo(seconds: Int) {
        val duration = engine.state.value.durationSec
        val target = if (duration > 0) clampSeconds(seconds, duration) else seconds.coerceAtLeast(0)
        viewModelScope.launch { engine.seekTo(target) }
    }

    fun skipBy(delta: Int) {
        seekTo(engine.state.value.positionSec + delta)
    }

    fun jumpToQueueIndex(index: Int) {
        viewModelScope.launch { engine.jumpToQueueIndex(index) }
    }

    /**
     * Saves a note for the current track. A null [annotation] creates one at
     * [positionSec]; otherwise the existing note is edited. Returns false when
     * there is no track or the write failed.
     */
    suspend fun saveNote(
        annotation: Annotation?,
        positionSec: Int,
        text: String,
        tags: List<String>,
        color: String,
    ): Boolean = try {
        if (annotation != null) {
            annotations.update(annotation.id, text, tags, color) != null
        } else {
            val state = engine.state.value
            val trackId = state.trackId ?: return false
            val contentHash = state.contentHash ?: return false
            annotations.create(trackId, contentHash, positionSec, text, tags, color)
            true
        }
    } catch (_: Exception) {
        false
    }

    suspend fun deleteNote(annotation: Annotation): Boolean = try {
        annotations.delete(annotation.id)
        true
    } catch (_: Exception) {
        false
    }

    fun playFirstTrack() {
        viewModelScope.launch {
            val track = library.firstPlayable() ?: return@launch
            PlaybackService.start(context)
            launcher.playResolved(track, fallbackQueue = listOf(track.id))
        }
    }

    fun cycleSpeed() {
        val next = nextSpeed(engine.state.value.playbackSpeed)
        viewModelScope.launch { engine.setSpeed(next) }
    }

    fun setCollectionSort(sort: CollectionSort, direction: SortDirection) {
        viewModelScope.launch { engine.setCollectionSort(sort, direction) }
    }

    fun setVolume(percent: Int) {
        effects.setVolume(percent)
        viewModelScope.launch { engine.setVolume(percent) }
    }

    fun setSleep(minutes: Int) {
        engine.sleepTimer.start(minutes, System.currentTimeMillis())
        startSleepTicker()
    }

    fun cancelSleep() {
        engine.sleepTimer.cancel()
        sleepTicker?.cancel()
        sleepTicker = null
        _sleepRemainingSec.value = null
    }

    private fun startSleepTicker() {
        sleepTicker?.cancel()
        sleepTicker = viewModelScope.launch {
            while (true) {
                val remaining = engine.sleepTimer.remainingSec(System.currentTimeMillis())
                _sleepRemainingSec.value = remaining
                if (remaining == null) break
                delay(1_000)
            }
        }
    }

    fun updateEnhancer(
        enabled: Boolean? = null,
        boostDb: Double? = null,
        bassDb: Double? = null,
        trebleDb: Double? = null,
    ) {
        effects.setEnhancer(enabled, boostDb, bassDb, trebleDb)
    }

    fun selectTone(id: String) {
        effects.setTone(id)
    }

    fun setToneLevel(level: Int) {
        effects.setToneLevel(level)
    }

    fun probeEnhancer() {
        effects.probe()
    }
}
