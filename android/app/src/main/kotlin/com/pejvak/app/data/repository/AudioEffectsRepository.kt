package com.pejvak.app.data.repository

import com.pejvak.app.data.local.SettingsDao
import com.pejvak.app.data.local.SettingsEntity
import com.pejvak.app.domain.AudioEnhancerSettings
import com.pejvak.app.domain.DEFAULT_TONE_ID
import com.pejvak.app.domain.ROOM_TONE_MAX
import com.pejvak.app.domain.ROOM_TONE_PICK_LEVEL
import com.pejvak.app.domain.normalizeRoomTone
import com.pejvak.app.domain.parseStoredEnhancer
import com.pejvak.app.domain.parseToneId
import com.pejvak.app.domain.patchEnhancer
import com.pejvak.app.domain.serializeEnhancer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Device-only audio preferences: they never sync (mirrors the RN settings keys). */
data class AudioEffectsState(
    val enhancer: AudioEnhancerSettings = AudioEnhancerSettings(),
    val toneId: String = DEFAULT_TONE_ID,
    val toneLevel: Int = 0,
    val volume: Int = 100,
    val loaded: Boolean = false,
)

/**
 * Owns the audio-treatment preferences and writes them back coalesced, because a
 * slider reports every pixel of a drag and a hundred database writes per gesture
 * is not a persistence strategy. The in-memory state changes immediately.
 */
@Singleton
class AudioEffectsRepository @Inject constructor(
    private val settingsDao: SettingsDao,
) {
    private val _state = MutableStateFlow(AudioEffectsState())
    val state: StateFlow<AudioEffectsState> = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pending = mutableMapOf<String, String>()
    private var persistJob: Job? = null

    suspend fun load(): AudioEffectsState {
        if (_state.value.loaded) return _state.value
        val next = AudioEffectsState(
            enhancer = parseStoredEnhancer(settingsDao.get(KEY_ENHANCER)),
            toneId = parseToneId(settingsDao.get(KEY_TONE)),
            toneLevel = normalizeRoomTone(settingsDao.get(KEY_ROOM_TONE)),
            volume = settingsDao.get(KEY_VOLUME)?.trim()?.toIntOrNull()?.coerceIn(0, 100) ?: 100,
            loaded = true,
        )
        _state.value = next
        return next
    }

    fun setEnhancer(
        enabled: Boolean? = null,
        boostDb: Double? = null,
        bassDb: Double? = null,
        trebleDb: Double? = null,
    ) {
        val next = patchEnhancer(_state.value.enhancer, enabled, boostDb, bassDb, trebleDb)
        _state.value = _state.value.copy(enhancer = next)
        scheduleWrite(KEY_ENHANCER, serializeEnhancer(next))
    }

    fun setTone(id: String) {
        val next = parseToneId(id)
        val current = _state.value
        if (next == current.toneId) return
        val level = if (current.toneLevel == 0) ROOM_TONE_PICK_LEVEL else current.toneLevel
        _state.value = current.copy(toneId = next, toneLevel = level)
        scheduleWrite(KEY_TONE, next)
        if (level != current.toneLevel) scheduleWrite(KEY_ROOM_TONE, level.toString())
    }

    fun setToneLevel(level: Int) {
        val next = normalizeRoomTone(level.coerceIn(0, ROOM_TONE_MAX))
        if (next == _state.value.toneLevel) return
        _state.value = _state.value.copy(toneLevel = next)
        scheduleWrite(KEY_ROOM_TONE, next.toString())
    }

    fun setVolume(percent: Int) {
        val next = percent.coerceIn(0, 100)
        if (next == _state.value.volume) return
        _state.value = _state.value.copy(volume = next)
        scheduleWrite(KEY_VOLUME, next.toString())
    }

    private fun scheduleWrite(key: String, value: String) {
        synchronized(pending) { pending[key] = value }
        persistJob?.cancel()
        persistJob = scope.launch {
            delay(PERSIST_DELAY_MS)
            flush()
        }
    }

    suspend fun flush() {
        val rows = synchronized(pending) {
            val copy = pending.toList()
            pending.clear()
            copy
        }
        for ((key, value) in rows) {
            try {
                settingsDao.put(SettingsEntity(key, value))
            } catch (_: Exception) {
                // A lost preference is not worth a message; the next drag retries.
            }
        }
    }

    companion object {
        private const val PERSIST_DELAY_MS = 400L
        private const val KEY_ENHANCER = "audioEnhancer"
        private const val KEY_ROOM_TONE = "roomTone"
        private const val KEY_TONE = "ambientTone"
        private const val KEY_VOLUME = "volume"
    }
}
