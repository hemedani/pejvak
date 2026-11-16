package com.pejvak.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.auth.AuthRepository
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.data.sync.SyncRepository
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.HistoryQuota
import com.pejvak.app.domain.MotionPreference
import com.pejvak.app.domain.ThemePreference
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Settings: account + sync (SE-01/05/08, SY-10) and the Phase 13 preferences
 * (SE-02..07) — playback speed, appearance, motion and haptics. Device-only
 * prefs never sync; speed is shared and follows the listener (LWW).
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val syncRepository: SyncRepository,
    private val syncScheduler: SyncScheduler,
    private val trackDao: TrackDao,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {

    data class UiState(
        val user: AuthRepository.AuthUser? = null,
        val pending: SyncRepository.PendingCounts = SyncRepository.PendingCounts(),
        val lastSyncAt: Long? = null,
        val quota: HistoryQuota? = null,
        val storageBytes: Long = 0,
        val loading: Boolean = true,
        val syncing: Boolean = false,
        val signingOut: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    val preferences: StateFlow<SettingsRepository.AppSettings> = settingsRepository.settings

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val user = runCatching { authRepository.getCachedUser() }.getOrNull()
            val pending = runCatching { syncRepository.pendingCounts() }.getOrElse { SyncRepository.PendingCounts() }
            val lastSyncAt = runCatching { syncRepository.lastSyncAt() }.getOrNull()
            val storageBytes = runCatching { trackDao.getAll().sumOf { it.file_size_bytes } }.getOrDefault(0L)
            runCatching { settingsRepository.load() }
            _state.update {
                it.copy(
                    user = user ?: it.user,
                    pending = pending,
                    lastSyncAt = lastSyncAt,
                    quota = syncRepository.lastQuota.value,
                    storageBytes = storageBytes,
                    loading = false,
                )
            }
        }
    }

    /** A manual push + pull. Failures are swallowed; the queue stays visible. */
    fun syncNow() {
        if (_state.value.syncing) return
        _state.update { it.copy(syncing = true) }
        viewModelScope.launch {
            runCatching { syncRepository.syncAll() }
            refresh()
            _state.update { it.copy(syncing = false, quota = syncRepository.lastQuota.value) }
        }
    }

    fun setTheme(preference: ThemePreference) {
        viewModelScope.launch { settingsRepository.setTheme(preference) }
    }

    fun setDefaultSpeed(speed: Double) {
        viewModelScope.launch { settingsRepository.setDefaultSpeed(speed) }
    }

    fun setMotionPreference(preference: MotionPreference) {
        viewModelScope.launch { settingsRepository.setMotionPreference(preference) }
    }

    fun setHapticsEnabled(enabled: Boolean) {
        viewModelScope.launch { settingsRepository.setHapticsEnabled(enabled) }
    }

    fun logout() {
        _state.update { it.copy(signingOut = true) }
        viewModelScope.launch {
            authRepository.logout()
            syncScheduler.cancelAll()
            _state.update { it.copy(signingOut = false) }
        }
    }
}
