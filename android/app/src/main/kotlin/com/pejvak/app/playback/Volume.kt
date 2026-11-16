package com.pejvak.app.playback

import kotlin.math.pow

/** Volume curve (mirrors mobile/src/lib/audioEffects.ts). Pure. */

const val DEFAULT_VOLUME: Int = 100
const val VOLUME_MAX: Int = 100
const val VOLUME_FLOOR_DB: Double = -40.0

/** The player's amplitude for a slider position. 100% is exactly 1.0; 0% is silence. */
fun volumeAmplitude(percent: Int): Float {
    val clamped = percent.coerceIn(0, VOLUME_MAX)
    if (clamped == 0) return 0f
    return 10.0.pow((VOLUME_FLOOR_DB * (1 - clamped.toDouble() / VOLUME_MAX)) / 20).toFloat()
}

/**
 * Coerces a stored volume into 0–100. An *absent* level is full scale, never muted
 * (a fresh install must not play into silence); only a real 0 mutes.
 */
fun normalizeVolume(raw: String?): Int {
    if (raw.isNullOrBlank()) return DEFAULT_VOLUME
    val parsed = raw.trim().toDoubleOrNull() ?: return DEFAULT_VOLUME
    return Math.round(parsed).toInt().coerceIn(0, VOLUME_MAX)
}