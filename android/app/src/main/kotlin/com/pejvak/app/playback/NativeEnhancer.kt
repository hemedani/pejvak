package com.pejvak.app.playback

import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import com.pejvak.app.domain.bassWeight
import com.pejvak.app.domain.trebleWeight

/**
 * Equalizer + LoudnessEnhancer on the player's own audio session (the native
 * advantage over the RN output-mix session 0). Every native call is caught: an
 * OEM that refuses the effect must leave playback untouched, not crash it.
 */
class NativeEnhancer {
    private var equalizer: Equalizer? = null
    private var loudness: LoudnessEnhancer? = null
    private var bandFreqs = DoubleArray(0)
    private var minLevelMb = -1500
    private var maxLevelMb = 1500
    private var appliedLevels: IntArray? = null
    private var boostMb = 0
    private var enabled = false

    var available: Boolean = false
        private set
    var reason: String? = null
        private set

    fun attach(sessionId: Int): Boolean {
        if (equalizer != null) return true
        if (sessionId <= 0) {
            reason = "This player has no audio session to attach to."
            available = false
            return false
        }
        return try {
            val eq = Equalizer(EFFECT_PRIORITY, sessionId)
            val range = eq.bandLevelRange
            minLevelMb = range[0].toInt()
            maxLevelMb = range[1].toInt()
            bandFreqs = DoubleArray(eq.numberOfBands.toInt()) { eq.getCenterFreq(it.toShort()) / 1000.0 }
            eq.enabled = false
            equalizer = eq
            loudness = try {
                LoudnessEnhancer(sessionId).also { it.enabled = false }
            } catch (_: Throwable) {
                null
            }
            available = true
            reason = null
            appliedLevels = null
            true
        } catch (error: Throwable) {
            detach()
            reason = error.message ?: "This device refused the audio effect."
            available = false
            false
        }
    }

    fun setEnabled(value: Boolean) {
        enabled = value
        try {
            equalizer?.enabled = value
        } catch (_: Throwable) {
            // The system can release an effect at any time; the next change retries.
        }
        applyLoudness()
    }

    fun setGains(boostDb: Double, bassDb: Double, trebleDb: Double) {
        boostMb = (boostDb.coerceAtLeast(0.0) * 100).toInt()
        val eq = equalizer
        if (eq != null) {
            val levels = IntArray(bandFreqs.size) { index ->
                val freq = bandFreqs[index]
                val db = bassDb * bassWeight(freq) + trebleDb * trebleWeight(freq)
                (db * 100).toInt().coerceIn(minLevelMb, maxLevelMb)
            }
            if (appliedLevels == null || !appliedLevels!!.contentEquals(levels)) {
                for (index in levels.indices) {
                    try {
                        eq.setBandLevel(index.toShort(), levels[index].toShort())
                    } catch (_: Throwable) {
                        // One refused band must not abandon the others.
                    }
                }
                appliedLevels = levels
            }
        }
        val enhancer = loudness
        if (enhancer != null) {
            try {
                enhancer.setTargetGain(boostMb)
            } catch (_: Throwable) {
                // Leave the previous gain rather than failing the whole curve.
            }
        }
        applyLoudness()
    }

    private fun applyLoudness() {
        val enhancer = loudness ?: return
        try {
            enhancer.enabled = enabled && boostMb > 0
        } catch (_: Throwable) {
            // Same rule as above.
        }
    }

    fun detach() {
        try {
            equalizer?.enabled = false
            equalizer?.release()
        } catch (_: Throwable) {
            // Already gone.
        }
        try {
            loudness?.enabled = false
            loudness?.release()
        } catch (_: Throwable) {
            // Already gone.
        }
        equalizer = null
        loudness = null
        bandFreqs = DoubleArray(0)
        appliedLevels = null
        enabled = false
        boostMb = 0
        available = false
    }

    private companion object {
        const val EFFECT_PRIORITY = 1
    }
}
