package com.pejvak.app.playback

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.exoplayer.ExoPlayer
import com.pejvak.app.data.repository.AudioEffectsRepository
import com.pejvak.app.data.repository.AudioEffectsState
import com.pejvak.app.domain.AudioEnhancerSettings
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Whether this device will let the enhancer attach, and why not when it won't. */
data class EnhancerStatus(val available: Boolean = false, val reason: String? = null)

/**
 * Owns the two audio treatments and keeps them following the transport.
 *
 * The enhancer attaches to the track player's real audio session and is released
 * the moment it is switched off or playback stops, so it never colours audio the
 * listener did not ask for. The tone player is paused rather than released on a
 * pause (a pause is usually momentary) and released on stop or teardown.
 */
@Singleton
class AudioEffectsController @Inject constructor(
    @ApplicationContext context: Context,
    private val repository: AudioEffectsRepository,
) {
    val state: StateFlow<AudioEffectsState> = repository.state

    private val _enhancerStatus = MutableStateFlow(EnhancerStatus())
    val enhancerStatus: StateFlow<EnhancerStatus> = _enhancerStatus.asStateFlow()

    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val enhancer = NativeEnhancer()
    private val tonePlayer = TonePlayer(context)
    private var player: ExoPlayer? = null
    private var sessionId: Int = 0
    private var playbackActive = false

    init {
        scope.launch {
            repository.load()
            main.post { applyAll() }
        }
    }

    /** Called by the service once the track player exists and has a session id. */
    fun bind(player: ExoPlayer, sessionId: Int) {
        main.post {
            this.player = player
            this.sessionId = sessionId
            applyVolume()
            if (playbackActive) applyEnhancer() else detachEnhancer()
            if (playbackActive) applyTone()
        }
    }

    /** The service is going away: give the effect and the noise player back. */
    fun unbind() {
        main.post {
            player = null
            playbackActive = false
            detachEnhancer()
            tonePlayer.release()
        }
    }

    fun setEnhancer(
        enabled: Boolean? = null,
        boostDb: Double? = null,
        bassDb: Double? = null,
        trebleDb: Double? = null,
    ) {
        repository.setEnhancer(enabled, boostDb, bassDb, trebleDb)
        main.post { applyEnhancer() }
    }

    fun setTone(id: String) {
        repository.setTone(id)
        main.post { applyTone() }
    }

    fun setToneLevel(level: Int) {
        repository.setToneLevel(level)
        main.post { applyTone() }
    }

    fun setVolume(percent: Int) {
        repository.setVolume(percent)
        main.post { applyVolume() }
    }

    /** Idempotent; the service's 1 Hz tick may call it freely. */
    fun syncPlayback(playing: Boolean) {
        main.post {
            if (playing == playbackActive) return@post
            playbackActive = playing
            if (playing) {
                applyEnhancer()
                applyTone()
            } else {
                tonePlayer.pause()
            }
        }
    }

    /** Stop/teardown: the effects must not outlive the audio they shape. */
    fun releaseTransport() {
        main.post {
            playbackActive = false
            detachEnhancer()
            tonePlayer.release()
        }
    }

    /** Asks the device whether the enhancer is usable without switching it on. */
    fun probe() {
        main.post {
            if (!enhancer.available) enhancer.attach(sessionId)
            publishStatus()
        }
    }

    private fun applyAll() {
        val current = repository.state.value
        applyVolume()
        if (current.enhancer.enabled && playbackActive) applyEnhancer() else detachEnhancer()
        if (playbackActive) applyTone()
    }

    private fun applyVolume() {
        player?.volume = volumeAmplitude(repository.state.value.volume)
    }

    private fun applyEnhancer() {
        val settings: AudioEnhancerSettings = repository.state.value.enhancer
        if (!settings.enabled) {
            detachEnhancer()
            return
        }
        if (!enhancer.attach(sessionId)) {
            publishStatus()
            return
        }
        enhancer.setGains(settings.boostDb, settings.bassDb, settings.trebleDb)
        enhancer.setEnabled(true)
        publishStatus()
    }

    private fun detachEnhancer() {
        enhancer.detach()
        publishStatus()
    }

    private fun publishStatus() {
        val next = EnhancerStatus(enhancer.available, enhancer.reason)
        if (_enhancerStatus.value != next) _enhancerStatus.value = next
    }

    private fun applyTone() {
        val current = repository.state.value
        tonePlayer.apply(current.toneId, current.toneLevel, playbackActive)
    }
}
