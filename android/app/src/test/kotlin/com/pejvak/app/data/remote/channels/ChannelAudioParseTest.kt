package com.pejvak.app.data.remote.channels

import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChannelAudioParseTest {

    @Test
    fun parseAudioReadsTheServerWaveformStrip() {
        val obj = buildJsonObject {
            put("_id", "audio-1")
            put("title", "Episode")
            put("audioUrl", "https://cdn.example/x.mp3")
            put("durationSec", 468)
            put("waveform", buildJsonArray { for (i in 0 until 160) add((i % 10) / 10.0) })
        }

        val audio = parseAudio(obj, "chan", null)

        assertEquals(160, audio.waveform.size)
        assertEquals(0f, audio.waveform.first(), 0.0001f)
        assertEquals(0.9f, audio.waveform[9], 0.0001f)
    }

    @Test
    fun parseAudioLeavesWaveformEmptyWhenTheServerHasNone() {
        val obj = buildJsonObject {
            put("_id", "audio-2")
            put("title", "Episode")
            put("audioUrl", "https://cdn.example/x.mp3")
            put("durationSec", 100)
        }

        val audio = parseAudio(obj, "chan", null)

        assertTrue(audio.waveform.isEmpty())
    }
}
