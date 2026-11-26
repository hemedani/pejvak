package com.pejvak.app.domain

import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.sin
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

/**
 * Turns a server-computed loudness strip (0..1, any bucket count) into the
 * [WAVEFORM_BUCKETS] heights the scrubber caches. The server samples the episode it
 * hosts, so a streamed channel track has real bars even though there is no local file
 * to decode. Returns null for an absent strip, letting the analyzer fall back.
 */
fun wireWaveform(values: List<Float>, buckets: Int = WAVEFORM_BUCKETS): FloatArray? {
    if (values.isEmpty() || buckets <= 0) return null
    val clamped = FloatArray(values.size) { values[it].coerceIn(0f, 1f) }
    val resampled = sampleWaveform(clamped, buckets)
    return FloatArray(buckets) { resampled[it].coerceIn(WAVEFORM_MIN_HEIGHT, 1f) }
}

/** One turn of the sample's sines. */
private const val TWO_PI: Float = (2.0 * kotlin.math.PI).toFloat()

/**
 * A stand-in strip for audio that cannot be measured.
 *
 * A stream has no file to decode, so there is no loudness to read; a file the
 * platform refuses is the same story. Drawing the plain rule in that case made the
 * bar look broken, so those tracks get a *sample* instead of nothing — and it is
 * labelled as one by its shape, not by a badge: phrases that swell out of a pause
 * and fall back into one, a grain over the top, and neither extreme touched, so it
 * never claims to be a measurement of silence or of a full-scale wall.
 *
 * Seeded by the track's identity, so a station always looks the same and skipping
 * away and back does not reshuffle it. Pure and cheap: no allocation beyond the
 * result, no clock, no random source.
 */
fun sampleWaveformFor(seed: String, buckets: Int = WAVEFORM_BUCKETS): FloatArray {
    if (buckets <= 0) return FloatArray(0)
    var state = seed.fold(0x9E3779B9.toInt()) { carry, char -> carry * 31 + char.code }
    fun next(): Float {
        state = state * 1_103_515_245 + 12_345
        return ((state ushr 16) and 0x7FFF) / 32_767f
    }

    // Two scales, because three alias: a phrase is long enough to read as a
    // sentence and the grain is short enough to read as words inside it.
    val phrases = 2.5f + next() * 3f
    val phrasePhase = next() * TWO_PI
    val grain = 7f + next() * 5f
    val grainPhase = next() * TWO_PI
    val floor = 0.20f + next() * 0.06f
    val ceiling = 0.84f + next() * 0.10f

    return FloatArray(buckets) { index ->
        val t = index / buckets.toFloat()
        // 0 at a pause, 1 in the middle of a phrase.
        val phrase = 0.5f - 0.5f * cos(t * phrases * TWO_PI + phrasePhase)
        val grainWave = 0.5f + 0.5f * sin(t * grain * TWO_PI + grainPhase)
        val tooth = next() * 0.16f - 0.08f
        val loudness = phrase * (0.72f + 0.28f * grainWave) + tooth
        (floor + (ceiling - floor) * loudness.coerceIn(0f, 1f)).coerceIn(WAVEFORM_MIN_HEIGHT, 1f)
    }
}
