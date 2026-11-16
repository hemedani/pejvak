package com.pejvak.app.domain

import com.pejvak.app.playback.normalizeVolume
import com.pejvak.app.playback.volumeAmplitude
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class AudioEffectsTest {

    @Test
    fun `tone catalogue is seven tones with room generated and credits owed only by recordings`() {
        assertEquals(7, TONES.size)
        assertEquals(listOf("room", "rain", "forest", "river", "ocean", "wind", "birds"), TONES.map { it.id })
        val room = TONES.first()
        assertEquals(ToneKind.Generated, room.kind)
        assertEquals(4, room.seconds)
        assertEquals(0x9e3779b9.toInt(), room.seed)
        for (tone in TONES) {
            if (tone.kind == ToneKind.Recorded) {
                assertTrue("${tone.id} owes a credit", TONE_CREDITS.containsKey(tone.id))
            } else {
                assertNull(TONE_CREDITS[tone.id])
            }
        }
    }

    @Test
    fun `unknown tone ids fall back to the room tone`() {
        assertEquals("room", parseToneId(null))
        assertEquals("room", parseToneId("waves"))
        assertEquals("rain", parseToneId("rain"))
        assertNull(findTone("waves"))
    }

    @Test
    fun `tone files name the generated buffer and the bundled recordings`() {
        assertEquals("tone-room.wav", toneFileName("room"))
        assertEquals("tones/rain.mp3", toneAssetName("rain"))
        assertNull(toneAssetName("room"))
    }

    @Test
    fun `room tone level maps zero to silence and the top to the ceiling`() {
        assertEquals(0f, roomToneAmplitude(0), 0f)
        assertEquals(0f, roomToneAmplitude(-10), 0f)
        val topDb = TONE_TARGET_RMS_DB + 20 * kotlin.math.log10(roomToneAmplitude(100).toDouble())
        assertEquals(ROOM_TONE_DB.ceiling, topDb, 0.001)
        val levels = listOf(1, 10, 35, 60, 100).map { roomToneAmplitude(it) }
        assertEquals(levels.sorted(), levels)
    }

    @Test
    fun `level readouts and stored values are whole percent`() {
        assertEquals("Off", describeRoomTone(0))
        assertEquals("24%", describeRoomTone(24))
        assertEquals(0, normalizeRoomTone(null))
        assertEquals(0, normalizeRoomTone(""))
        assertEquals(35, normalizeRoomTone("35"))
        assertEquals(100, normalizeRoomTone(140))
        assertEquals(0, normalizeRoomTone("x"))
    }

    @Test
    fun `volume is full scale unless a stored level says otherwise`() {
        assertEquals(1f, volumeAmplitude(100), 0.0001f)
        assertEquals(0f, volumeAmplitude(0), 0f)
        assertEquals(0.1f, volumeAmplitude(50), 0.0001f)
        assertEquals(100, normalizeVolume(null))
        assertEquals(0, normalizeVolume("0"))
        assertEquals(60, normalizeVolume("60"))
    }

    @Test
    fun `room tone wav is a deterministic mono 22k pcm loop at the shared loudness`() {
        val wav = buildRoomToneWav()
        assertEquals("RIFF", String(wav.copyOfRange(0, 4), Charsets.US_ASCII))
        assertEquals("WAVE", String(wav.copyOfRange(8, 12), Charsets.US_ASCII))
        val sampleRate = le32(wav, 24)
        assertEquals(TONE_SAMPLE_RATE, sampleRate)
        assertEquals(1, le16(wav, 22))
        assertEquals(16, le16(wav, 34))
        val dataBytes = le32(wav, 40)
        assertEquals(TONE_SAMPLE_RATE * 4 * 2, dataBytes)
        assertEquals(44 + dataBytes, wav.size)
        assertTrue(wav.contentEquals(buildRoomToneWav()))

        var sum = 0.0
        var energy = 0.0
        var peak = 0.0
        val count = dataBytes / 2
        for (i in 0 until count) {
            val value = le16(wav, 44 + i * 2).toShort() / 32768.0
            sum += value
            energy += value * value
            peak = maxOf(peak, abs(value))
        }
        val mean = sum / count
        val rms = kotlin.math.sqrt(energy / count)
        assertTrue("DC offset $mean", abs(mean) < 0.005)
        assertEquals(0.12, rms, 0.01)
        assertTrue("peak $peak", peak <= 0.981)
    }

    @Test
    fun `shelf weights fade between their corners on a log scale`() {
        assertEquals(1.0, bassWeight(120.0), 0.0001)
        assertEquals(0.0, bassWeight(400.0), 0.0001)
        assertEquals(0.5, bassWeight(219.09), 0.01)
        assertEquals(0.0, trebleWeight(2000.0), 0.0001)
        assertEquals(1.0, trebleWeight(8000.0), 0.0001)
        assertEquals(0.5, trebleWeight(4000.0), 0.0001)
        assertEquals(1.0, bassWeight(60.0), 0.0001)
        assertEquals(0.0, trebleWeight(1000.0), 0.0001)
    }

    @Test
    fun `stored enhancer json round-trips and falls back field by field`() {
        val settings = AudioEnhancerSettings(enabled = true, boostDb = 3.0, bassDb = -4.5, trebleDb = 12.0)
        assertEquals(settings, parseStoredEnhancer(serializeEnhancer(settings)))
        assertEquals(AudioEnhancerSettings(), parseStoredEnhancer(null))
        assertEquals(AudioEnhancerSettings(), parseStoredEnhancer("not json"))
        val partial = parseStoredEnhancer("{\"enabled\":true,\"bassDb\":99}")
        assertEquals(true, partial.enabled)
        assertEquals(12.0, partial.bassDb, 0.0001)
        assertEquals(0.0, partial.boostDb, 0.0001)
    }

    private fun le16(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xFF) or ((bytes[offset + 1].toInt() and 0xFF) shl 8)

    private fun le32(bytes: ByteArray, offset: Int): Int =
        le16(bytes, offset) or (le16(bytes, offset + 2) shl 16)
}
