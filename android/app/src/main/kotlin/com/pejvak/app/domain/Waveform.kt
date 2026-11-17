package com.pejvak.app.domain

import kotlin.math.log10
import kotlin.math.sqrt

/**
 * The progress bar's bar heights. A track's loudness is sampled once into
 * [WAVEFORM_BUCKETS] RMS windows and stored as 0..1 heights; the bar strip then
 * resamples that array to however many bars fit the width.
 *
 * Everything here is pure: the decode lives in `WaveformAnalyzer`, and the drawing
 * lives in the scrubber.
 */

/** RMS windows stored per track — comfortably more than the bars a phone shows. */
const val WAVEFORM_BUCKETS: Int = 84

/** At or below this level a window is silence, and its bar sits on the floor. */
const val WAVEFORM_FLOOR_DB: Float = -52f

/** The level that fills a bar completely. Speech rarely passes it; music does. */
const val WAVEFORM_CEIL_DB: Float = -6f

/** Silence still draws this much bar, so a quiet passage reads as a track, not a gap. */
const val WAVEFORM_MIN_HEIGHT: Float = 0.12f

/** Full-scale RMS for 16-bit PCM. */
private const val FULL_SCALE: Float = 32_768f

/**
 * Maps raw RMS windows (0..1, full-scale) to bar heights (0..1).
 *
 * Loudness is mapped in decibels, not linearly: an audiobook's speech sits around
 * -30..-18 dBFS and would otherwise collapse into a nearly flat line, while a
 * single loud peak would own the whole scale. Below [WAVEFORM_FLOOR_DB] the bar
 * rests on [WAVEFORM_MIN_HEIGHT].
 */
fun waveformFromRms(rms: FloatArray): FloatArray = FloatArray(rms.size) { waveformHeight(rms[it]) }

/** One RMS window as a bar height (0..1) — see [waveformFromRms] for the mapping. */
fun waveformHeight(rms: Float): Float {
    if (rms <= 0f) return WAVEFORM_MIN_HEIGHT
    val db = 20f * log10(rms.coerceAtLeast(1e-6f))
    val t = ((db - WAVEFORM_FLOOR_DB) / (WAVEFORM_CEIL_DB - WAVEFORM_FLOOR_DB)).coerceIn(0f, 1f)
    return WAVEFORM_MIN_HEIGHT + (1f - WAVEFORM_MIN_HEIGHT) * t
}

/** Converts one accumulated sum of squares and its sample count into RMS. */
fun rmsOf(energy: Double, samples: Int): Float = if (samples <= 0) 0f else sqrt(energy / samples).toFloat()

/** A 16-bit sample as a full-scale float. */
fun pcm16FullScale(sample: Short): Float = sample / FULL_SCALE

/**
 * Resamples [values] to [bars] heights, keeping the peak of each span rather than
 * its average — a waveform that averages loses exactly the transients that make it
 * legible. Narrower bars than buckets fall back to the nearest bucket.
 */
fun sampleWaveform(values: FloatArray, bars: Int): FloatArray {
    if (bars <= 0) return FloatArray(0)
    if (values.isEmpty()) return FloatArray(bars) { WAVEFORM_MIN_HEIGHT }
    val out = FloatArray(bars)
    for (bar in 0 until bars) {
        val start = (bar.toFloat() / bars * values.size).toInt().coerceIn(0, values.lastIndex)
        val end = ((bar + 1f) / bars * values.size).toInt().coerceIn(start + 1, values.size)
        var peak = 0f
        for (index in start until end) if (values[index] > peak) peak = values[index]
        out[bar] = if (peak > 0f) peak else values[start]
    }
    return out
}
