package com.pejvak.app.domain

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

enum class ToneKind { Generated, Recorded }

data class AmbientTone(
    val id: String,
    val kind: ToneKind,
    val label: String,
    val hint: String,
    val seconds: Int? = null,
    val seed: Int? = null,
)

data class ToneCredit(val work: String, val artist: String, val licence: String)

val TONES: List<AmbientTone> = listOf(
    AmbientTone("room", ToneKind.Generated, "Room", "The faint hiss a quiet room already has.", seconds = 4, seed = 0x9e3779b9.toInt()),
    AmbientTone("rain", ToneKind.Recorded, "Rain", "Rain falling on leaves."),
    AmbientTone("forest", ToneKind.Recorded, "Forest", "A deciduous wood, with birds moving through it."),
    AmbientTone("river", ToneKind.Recorded, "River", "Water running fast over stones."),
    AmbientTone("ocean", ToneKind.Recorded, "Ocean", "Waves breaking on a beach and drawing back."),
    AmbientTone("wind", ToneKind.Recorded, "Wind", "A steady wind, with no edges to it."),
    AmbientTone("birds", ToneKind.Recorded, "Birds", "A dawn chorus, many birds at once."),
)

val TONE_CREDITS: Map<String, ToneCredit> = mapOf(
    "rain" to ToneCredit("Rain on leaves", "Gravity Sound", "CC BY 4.0"),
    "forest" to ToneCredit("2020-04-28 deciduous forest", "Strebo7", "CC BY-SA 4.0"),
    "river" to ToneCredit("James River Rapids 1", "Jarrod Stanley", "CC0"),
    "ocean" to ToneCredit("Ocean Waves on a Tropical Beach", "Jarrod Stanley", "CC0"),
    "wind" to ToneCredit("Windy day", "Gravity Sound", "CC BY 4.0"),
    "birds" to ToneCredit("Dawn chorus at Glencairnie, Craigmore", "DivyaCM", "CC BY 4.0"),
)

const val DEFAULT_TONE_ID: String = "room"
const val ROOM_TONE_MAX: Int = 100
const val ROOM_TONE_PICK_LEVEL: Int = 35

/** 22.05 kHz is plenty for a room's noise and halves the generated file. */
const val TONE_SAMPLE_RATE: Int = 22050

/** Loudness every tone is normalised to, as RMS in full-scale units (~-18.4 dBFS). */
const val TONE_TARGET_RMS: Double = 0.12

/** The same figure in decibels, the unit the level mapping works in. */
val TONE_TARGET_RMS_DB: Double = 20 * log10(TONE_TARGET_RMS)

/** The room-tone slider's output level, in dBFS, at its bottom and top. */
data class RoomToneRange(val floor: Double, val ceiling: Double)

val ROOM_TONE_DB: RoomToneRange = RoomToneRange(-75.0, -30.0)

fun describeCredits(): String = TONE_CREDITS.values
    .joinToString(" \u00b7 ") { "${it.work} \u2014 ${it.artist} (${it.licence})" }

fun findTone(id: String?): AmbientTone? = TONES.firstOrNull { it.id == id }

/** A tone removed from the catalogue degrades to the default, never to a dead control. */
fun parseToneId(value: String?): String = findTone(value)?.id ?: DEFAULT_TONE_ID

/** Where a generated tone's bytes live in the cache. Regenerable, so reclaimable. */
fun toneFileName(id: String): String = "tone-$id.wav"

/** The bundled recording for a recorded tone, or null for the generated one. */
fun toneAssetName(id: String): String? =
    if (findTone(id)?.kind == ToneKind.Recorded) "tones/$id.mp3" else null

/** Coerces a stored or dragged level into 0-100 whole percent; absent is zero. */
fun normalizeRoomTone(value: String?): Int {
    if (value.isNullOrBlank()) return 0
    val parsed = value.trim().toDoubleOrNull() ?: return 0
    if (!parsed.isFinite()) return 0
    return parsed.roundToInt().coerceIn(0, ROOM_TONE_MAX)
}

fun normalizeRoomTone(value: Int): Int = value.coerceIn(0, ROOM_TONE_MAX)

/** "Off" or "24%": the readout beside the tone slider. */
fun describeRoomTone(percent: Int): String =
    if (percent.coerceIn(0, ROOM_TONE_MAX) == 0) "Off" else "${percent.coerceIn(0, ROOM_TONE_MAX)}%"

/**
 * The noise player's linear volume for a slider position. Mapped in decibels
 * because the ear hears that way; the buffer is normalised to the shared RMS, so
 * the player's volume is one subtraction from the level wanted.
 */
fun roomToneAmplitude(percent: Int): Float {
    val clamped = percent.coerceIn(0, ROOM_TONE_MAX)
    if (clamped == 0) return 0f
    val db = ROOM_TONE_DB.floor + (clamped.toDouble() / ROOM_TONE_MAX) * (ROOM_TONE_DB.ceiling - ROOM_TONE_DB.floor)
    return 10.0.pow((db - TONE_TARGET_RMS_DB) / 20).toFloat()
}

private const val PEAK_CEILING = 0.98
private const val TWO_PI = Math.PI * 2

/** mulberry32: a seeded generator, so the same build always produces the same bytes. */
private fun createRandom(seed: Int): () -> Double {
    var state = seed.toLong() and 0xFFFFFFFFL
    return {
        state = (state + 0x6D2B79F5L) and 0xFFFFFFFFL
        var t = state
        t = ((t xor (t ushr 15)) * (t or 1L)) and 0xFFFFFFFFL
        t = (t xor (t + (((t xor (t ushr 7)) * (t or 61L)) and 0xFFFFFFFFL))) and 0xFFFFFFFFL
        ((t xor (t ushr 14)) and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }
}

/** A mono 16-bit PCM WAV of the room tone (deterministic, de-meaned, normalised). */
fun buildRoomToneWav(
    sampleRate: Int = TONE_SAMPLE_RATE,
    seconds: Int = TONES.first().seconds ?: 4,
    seed: Int = TONES.first().seed ?: 0,
): ByteArray {
    val rate = sampleRate.coerceAtLeast(8000)
    val length = rate * seconds.coerceAtLeast(1)
    val samples = FloatArray(length)
    val random = createRandom(seed)
    val coefficient = 1 - exp((-TWO_PI * 4500.0) / rate)
    var filtered = 0.0
    for (i in 0 until length) {
        val white = random() * 2 - 1
        filtered += coefficient * (white - filtered)
        samples[i] = (filtered * 0.8 + white * 0.2).toFloat()
    }
    normaliseTone(samples)
    return encodeToneWav(samples, rate)
}

private fun normaliseTone(samples: FloatArray) {
    if (samples.isEmpty()) return
    var sum = 0.0
    for (sample in samples) sum += sample
    val mean = sum / samples.size
    var energy = 0.0
    var peak = 0.0
    for (i in samples.indices) {
        val value = (samples[i] - mean).toFloat()
        samples[i] = value
        energy += value.toDouble() * value
        peak = max(peak, abs(value.toDouble()))
    }
    val rms = sqrt(energy / samples.size)
    if (rms <= 0 || peak <= 0) {
        samples.fill(0f)
        return
    }
    val gain = minOf(TONE_TARGET_RMS / rms, PEAK_CEILING / peak)
    for (i in samples.indices) samples[i] = (samples[i].toDouble() * gain).toFloat()
}

private fun encodeToneWav(samples: FloatArray, sampleRate: Int): ByteArray {
    val dataBytes = samples.size * 2
    val out = ByteArray(44 + dataBytes)
    fun ascii(offset: Int, text: String) {
        for (i in text.indices) out[offset + i] = text[i].code.toByte()
    }
    fun le32(offset: Int, value: Int) {
        out[offset] = (value and 0xFF).toByte()
        out[offset + 1] = ((value ushr 8) and 0xFF).toByte()
        out[offset + 2] = ((value ushr 16) and 0xFF).toByte()
        out[offset + 3] = ((value ushr 24) and 0xFF).toByte()
    }
    fun le16(offset: Int, value: Int) {
        out[offset] = (value and 0xFF).toByte()
        out[offset + 1] = ((value ushr 8) and 0xFF).toByte()
    }
    ascii(0, "RIFF")
    le32(4, 36 + dataBytes)
    ascii(8, "WAVE")
    ascii(12, "fmt ")
    le32(16, 16)
    le16(20, 1)
    le16(22, 1)
    le32(24, sampleRate)
    le32(28, sampleRate * 2)
    le16(32, 2)
    le16(34, 16)
    ascii(36, "data")
    le32(40, dataBytes)
    for (i in samples.indices) {
        val scaled = samples[i].coerceIn(-1f, 1f)
        le16(44 + i * 2, (scaled * 32767).roundToInt())
    }
    return out
}
