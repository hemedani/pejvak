package com.pejvak.app.domain

import kotlin.math.ln
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class GainRange(val min: Double, val max: Double, val step: Double)

object EnhancerRange {
    val boostDb = GainRange(0.0, 12.0, 0.5)
    val bassDb = GainRange(-12.0, 12.0, 0.5)
    val trebleDb = GainRange(-12.0, 12.0, 0.5)
}

data class AudioEnhancerSettings(
    val enabled: Boolean = false,
    val boostDb: Double = 0.0,
    val bassDb: Double = 0.0,
    val trebleDb: Double = 0.0,
)

fun isEnhancerFlat(settings: AudioEnhancerSettings): Boolean =
    settings.boostDb == 0.0 && settings.bassDb == 0.0 && settings.trebleDb == 0.0

fun isEnhancerActive(settings: AudioEnhancerSettings): Boolean =
    settings.enabled && !isEnhancerFlat(settings)

private fun quantize(value: Double, range: GainRange): Double {
    if (!value.isFinite()) return 0.0
    val snapped = Math.round(value / range.step) * range.step
    return (Math.round(snapped * 10) / 10.0).coerceIn(range.min, range.max)
}

fun normalizeEnhancer(input: AudioEnhancerSettings): AudioEnhancerSettings = AudioEnhancerSettings(
    enabled = input.enabled,
    boostDb = quantize(input.boostDb, EnhancerRange.boostDb),
    bassDb = quantize(input.bassDb, EnhancerRange.bassDb),
    trebleDb = quantize(input.trebleDb, EnhancerRange.trebleDb),
)

fun patchEnhancer(
    current: AudioEnhancerSettings,
    enabled: Boolean? = null,
    boostDb: Double? = null,
    bassDb: Double? = null,
    trebleDb: Double? = null,
): AudioEnhancerSettings {
    val next = normalizeEnhancer(
        current.copy(
            enabled = enabled ?: current.enabled,
            boostDb = boostDb ?: current.boostDb,
            bassDb = bassDb ?: current.bassDb,
            trebleDb = trebleDb ?: current.trebleDb,
        ),
    )
    val movedBand = boostDb != null || bassDb != null || trebleDb != null
    return if (movedBand && enabled == null) next.copy(enabled = true) else next
}

/** Below this the bass shelf is at full strength; by [BASS_ZERO_HZ] it is gone. */
const val BASS_FULL_HZ: Double = 120.0
const val BASS_ZERO_HZ: Double = 400.0

/** The treble shelf starts at [TREBLE_ZERO_HZ] and is full at [TREBLE_FULL_HZ]. */
const val TREBLE_ZERO_HZ: Double = 2000.0
const val TREBLE_FULL_HZ: Double = 8000.0

/**
 * How much of the bass gain a band at [freqHz] takes, 0..1. Log-spaced because
 * pitch is: a linear taper would load the lowest band and leave its neighbour
 * untouched.
 */
fun bassWeight(freqHz: Double): Double = when {
    freqHz <= BASS_FULL_HZ -> 1.0
    freqHz >= BASS_ZERO_HZ -> 0.0
    else -> ln(BASS_ZERO_HZ / freqHz) / ln(BASS_ZERO_HZ / BASS_FULL_HZ)
}

/** How much of the treble gain a band at [freqHz] takes, 0..1. */
fun trebleWeight(freqHz: Double): Double = when {
    freqHz <= TREBLE_ZERO_HZ -> 0.0
    freqHz >= TREBLE_FULL_HZ -> 1.0
    else -> ln(freqHz / TREBLE_ZERO_HZ) / ln(TREBLE_FULL_HZ / TREBLE_ZERO_HZ)
}

fun describeGainDb(value: Double): String {
    if (value == 0.0) return "Off"
    val sign = if (value > 0) "+" else "\u2212"
    return "$sign${String.format(java.util.Locale.US, "%.1f", kotlin.math.abs(value))} dB"
}


/** The persisted form: one JSON object, so the three bands travel together. */
fun serializeEnhancer(settings: AudioEnhancerSettings): String = buildJsonObject {
    put("enabled", settings.enabled)
    put("boostDb", settings.boostDb)
    put("bassDb", settings.bassDb)
    put("trebleDb", settings.trebleDb)
}.toString()

/**
 * Reads a stored curve, falling back per field. A parse failure loses a tone
 * curve, not the library, so it never surfaces as an error.
 */
fun parseStoredEnhancer(raw: String?): AudioEnhancerSettings {
    if (raw.isNullOrBlank()) return AudioEnhancerSettings()
    val record = try {
        Json.parseToJsonElement(raw) as? JsonObject
    } catch (_: Exception) {
        null
    } ?: return AudioEnhancerSettings()
    return normalizeEnhancer(
        AudioEnhancerSettings(
            enabled = record["enabled"]?.jsonPrimitive?.booleanOrNull ?: false,
            boostDb = record["boostDb"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            bassDb = record["bassDb"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            trebleDb = record["trebleDb"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
        ),
    )
}
