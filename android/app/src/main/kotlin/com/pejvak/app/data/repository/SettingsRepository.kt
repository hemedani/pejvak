package com.pejvak.app.data.repository

import com.pejvak.app.data.local.SettingsDao
import com.pejvak.app.data.local.SettingsEntity
import com.pejvak.app.domain.HistorySort
import com.pejvak.app.domain.MotionPreference
import com.pejvak.app.domain.SharedSettings
import com.pejvak.app.domain.ThemePreference
import com.pejvak.app.domain.normalizeSharedSettings
import com.pejvak.app.domain.parseBoolean
import com.pejvak.app.domain.parseDefaultSpeed
import com.pejvak.app.domain.parseHistorySort
import com.pejvak.app.domain.parseLanguageCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Preferences (mirrors SettingsService.ts). Shared settings (languageCode,
 * defaultSpeed, historySort) follow the listener via LWW on settingsUpdatedAt;
 * device-only prefs (theme, motion, haptics) never sync. The settings KV table is
 * the store; a StateFlow lets the UI adopt a server snapshot live.
 */
@Singleton
class SettingsRepository @Inject constructor(
    private val settingsDao: SettingsDao,
) {
    data class AppSettings(
        val themePreference: ThemePreference = ThemePreference.System,
        val defaultSpeed: Double = 1.0,
        val historySort: HistorySort = HistorySort.Newest,
        val motionPreference: MotionPreference = MotionPreference.System,
        val hapticsEnabled: Boolean = true,
        val languageCode: String? = null,
    )

    private val _settings = MutableStateFlow(AppSettings())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    private suspend fun get(key: String): String? = settingsDao.get(key)
    private suspend fun put(key: String, value: String) = settingsDao.put(SettingsEntity(key, value))

    private fun parseTimestamp(value: String?): Long {
        val parsed = value?.toLongOrNull() ?: 0
        return if (parsed > 0) parsed else 0
    }

    suspend fun load(): AppSettings {
        val settings = AppSettings(
            themePreference = ThemePreference.from(get(KEY_THEME)),
            defaultSpeed = parseDefaultSpeed(get(KEY_SPEED)),
            historySort = parseHistorySort(get(KEY_HISTORY_SORT)),
            motionPreference = MotionPreference.from(get(KEY_MOTION)),
            hapticsEnabled = parseBoolean(get(KEY_HAPTICS), true),
            languageCode = parseLanguageCode(get(KEY_LANGUAGE)),
        )
        _settings.value = settings
        return settings
    }

    suspend fun setTheme(preference: ThemePreference) {
        put(KEY_THEME, preference.wire)
        _settings.value = _settings.value.copy(themePreference = preference)
    }

    suspend fun setMotionPreference(preference: MotionPreference) {
        put(KEY_MOTION, preference.wire)
        _settings.value = _settings.value.copy(motionPreference = preference)
    }

    suspend fun setHapticsEnabled(enabled: Boolean) {
        put(KEY_HAPTICS, enabled.toString())
        _settings.value = _settings.value.copy(hapticsEnabled = enabled)
    }

    suspend fun setDefaultSpeed(speed: Double) {
        put(KEY_SPEED, speed.toString())
        markSettingsChanged()
        _settings.value = _settings.value.copy(defaultSpeed = speed)
    }

    suspend fun setHistorySort(sort: HistorySort) {
        put(KEY_HISTORY_SORT, sort.wire)
        markSettingsChanged()
        _settings.value = _settings.value.copy(historySort = sort)
    }

    suspend fun setLanguage(code: String?) {
        put(KEY_LANGUAGE, code ?: "")
        markSettingsChanged()
        _settings.value = _settings.value.copy(languageCode = parseLanguageCode(code))
    }

    // --- Shared settings LWW ---

    private suspend fun getSettingsUpdatedAt(): Long = parseTimestamp(get(KEY_SETTINGS_UPDATED_AT))
    private suspend fun getSettingsSyncedAt(): Long = parseTimestamp(get(KEY_SETTINGS_SYNCED_AT))

    private suspend fun readSharedSettings(): SharedSettings = normalizeSharedSettings(
        languageCode = parseLanguageCode(get(KEY_LANGUAGE)),
        defaultSpeed = parseDefaultSpeed(get(KEY_SPEED)),
        historySort = parseHistorySort(get(KEY_HISTORY_SORT)).wire,
        updatedAt = getSettingsUpdatedAt(),
    )

    /** Advances the LWW token; keeps two same-millisecond changes ordered. */
    private suspend fun markSettingsChanged(): Long {
        val previous = getSettingsUpdatedAt()
        val next = maxOf(System.currentTimeMillis(), previous + 1)
        put(KEY_SETTINGS_UPDATED_AT, next.toString())
        return next
    }

    private suspend fun markSettingsSyncedToken(updatedAt: Long) {
        val syncedAt = getSettingsSyncedAt()
        val current = getSettingsUpdatedAt()
        val acknowledged = minOf(maxOf(0, updatedAt), current)
        val next = maxOf(syncedAt, acknowledged)
        if (next != syncedAt) put(KEY_SETTINGS_SYNCED_AT, next.toString())
    }

    suspend fun getSharedSettings(): SharedSettings = readSharedSettings()

    /** The snapshot a sync still owes the server, or null when already acknowledged. */
    suspend fun getPendingSharedSettings(): SharedSettings? {
        val settings = readSharedSettings()
        val syncedAt = getSettingsSyncedAt()
        return if (settings.updatedAt > syncedAt) settings else null
    }

    suspend fun markSettingsSynced(updatedAt: Long) = markSettingsSyncedToken(updatedAt)

    /**
     * Adopts the server's snapshot when newer — or when it ties and differs (the
     * server keeps the first of two equal timestamps, so it is the tie-breaker).
     * expectedUpdatedAt marks a push response, whose clamped token is canonical.
     */
    suspend fun applyRemoteSettings(remote: SharedSettings, expectedUpdatedAt: Long? = null): Boolean {
        val settings = normalizeSharedSettings(remote.languageCode, remote.defaultSpeed, remote.historySort.wire, remote.updatedAt)
        val local = readSharedSettings()
        val authoritative = expectedUpdatedAt != null && local.updatedAt <= expectedUpdatedAt

        if (!authoritative && settings.updatedAt < local.updatedAt) return false

        val valuesDiffer = settings.languageCode != local.languageCode ||
            settings.defaultSpeed != local.defaultSpeed ||
            settings.historySort != local.historySort
        val tokenChanged = settings.updatedAt != local.updatedAt

        // Write values before the token: a kill mid-apply must retry the whole snapshot.
        if (valuesDiffer) {
            put(KEY_LANGUAGE, settings.languageCode ?: "")
            put(KEY_SPEED, settings.defaultSpeed.toString())
            put(KEY_HISTORY_SORT, settings.historySort.wire)
        }
        if (tokenChanged) put(KEY_SETTINGS_UPDATED_AT, settings.updatedAt.toString())
        if (authoritative) put(KEY_SETTINGS_SYNCED_AT, settings.updatedAt.toString())
        else markSettingsSyncedToken(settings.updatedAt)

        if (valuesDiffer) {
            _settings.value = _settings.value.copy(
                languageCode = settings.languageCode,
                defaultSpeed = settings.defaultSpeed,
                historySort = settings.historySort,
            )
        }
        return tokenChanged || valuesDiffer
    }

    suspend fun getLastSyncAt(): Long? = get(KEY_LAST_SYNC_AT)?.toLongOrNull()
    suspend fun setLastSyncAt(timestampMs: Long) = put(KEY_LAST_SYNC_AT, timestampMs.toString())

    /** SRV-02: the Lesan base URL the last acknowledged sync ran against. */
    suspend fun getSyncEndpoint(): String? = get(KEY_SYNC_ENDPOINT)
    suspend fun setSyncEndpoint(endpoint: String) = put(KEY_SYNC_ENDPOINT, endpoint)

    companion object {
        private const val KEY_THEME = "themePreference"
        private const val KEY_SPEED = "defaultSpeed"
        private const val KEY_HISTORY_SORT = "historySort"
        private const val KEY_MOTION = "motionPreference"
        private const val KEY_HAPTICS = "hapticsEnabled"
        private const val KEY_LANGUAGE = "languageCode"
        private const val KEY_SETTINGS_UPDATED_AT = "settingsUpdatedAt"
        private const val KEY_SETTINGS_SYNCED_AT = "settingsSyncedAt"
        private const val KEY_LAST_SYNC_AT = "lastSyncAt"
        private const val KEY_SYNC_ENDPOINT = "syncEndpoint"
    }
}