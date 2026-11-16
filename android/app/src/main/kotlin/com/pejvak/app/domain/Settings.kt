package com.pejvak.app.domain

/**
 * Preferences (mirrors mobile/src/lib/settings.ts). Shared settings follow the
 * listener between devices (LWW on updatedAt); device-only prefs never sync. Pure.
 */

enum class ThemePreference(val wire: String) {
    System("system"), Light("light"), Dark("dark");
    companion object { fun from(wire: String?): ThemePreference = entries.firstOrNull { it.wire == wire } ?: System }
}

enum class MotionPreference(val wire: String) {
    System("system"), Full("full"), Reduced("reduced");
    companion object { fun from(wire: String?): MotionPreference = entries.firstOrNull { it.wire == wire } ?: System }
}

enum class HistorySort(val wire: String) {
    Newest("newest"), Oldest("oldest"), Longest("longest");
    companion object { fun from(wire: String?): HistorySort = entries.firstOrNull { it.wire == wire } ?: Newest }
}

val SPEED_OPTIONS: List<Double> = listOf(0.75, 1.0, 1.25, 1.5, 2.0)

/** The preferences that follow the listener between devices. updatedAt is the LWW token (epoch ms). */
data class SharedSettings(
    val languageCode: String?,
    val defaultSpeed: Double,
    val historySort: HistorySort,
    val updatedAt: Long,
)

val DEFAULT_SHARED_SETTINGS = SharedSettings(languageCode = null, defaultSpeed = 1.0, historySort = HistorySort.Newest, updatedAt = 0)

fun parseLanguageCode(value: String?): String? = value?.trim()?.ifEmpty { null }

fun parseDefaultSpeed(value: String?): Double {
    val parsed = value?.toDoubleOrNull() ?: Double.NaN
    return if (parsed.isFinite() && parsed in 0.5..3.0) parsed else 1.0
}

fun parseHistorySort(value: String?): HistorySort = HistorySort.from(value)

fun parseBoolean(value: String?, fallback: Boolean): Boolean = when (value) {
    "true" -> true
    "false" -> false
    else -> fallback
}

/**
 * Coerces a value from storage or the wire. Each field falls back on its own, so
 * one unknown language or an old speed cannot discard the rest of the choices.
 */
fun normalizeSharedSettings(
    languageCode: String? = null,
    defaultSpeed: Double? = null,
    historySort: String? = null,
    updatedAt: Long? = null,
): SharedSettings = SharedSettings(
    languageCode = parseLanguageCode(languageCode),
    defaultSpeed = parseDefaultSpeed(defaultSpeed?.toString()),
    historySort = parseHistorySort(historySort),
    updatedAt = updatedAt?.takeIf { it >= 0 } ?: 0,
)

/** Human file size: "512 B", "1.5 KB", "1.0 MB", "1.0 GB". */
fun formatBytes(bytes: Long): String {
    val value = if (bytes < 0) 0.0 else bytes.toDouble()
    return when {
        value < 1024 -> "${Math.round(value)} B"
        value < 1024.0 * 1024 -> "%.1f KB".format(value / 1024)
        value < 1024.0 * 1024 * 1024 -> "%.1f MB".format(value / (1024 * 1024))
        else -> "%.1f GB".format(value / (1024.0 * 1024 * 1024))
    }
}