package com.pejvak.app.data.media

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.WAVEFORM_BUCKETS
import com.pejvak.app.domain.isStreamUri
import com.pejvak.app.domain.pcm16FullScale
import com.pejvak.app.domain.rmsOf
import com.pejvak.app.domain.sampleWaveformFor
import com.pejvak.app.domain.waveformHeight
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.nio.ByteOrder
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Turns a track's audio into the bar heights behind the scrubber.
 *
 * The bars are the track's real loudness, not a decoration: the file is decoded and
 * an RMS window is measured at [WAVEFORM_BUCKETS] evenly spaced points. Sampling by
 * seek instead of decoding end to end keeps the cost independent of length — a
 * ten-hour audiobook and a three-minute song cost the same few seconds — because
 * only ~60 ms of audio is decoded per point.
 *
 * Results are cached twice: in memory for the session, and on disk keyed by
 * contentHash (which is the file's identity, so a re-import invalidates it by
 * construction). Partial results are emitted while decoding so the bars fill in
 * left to right instead of appearing all at once.
 *
 * Streams are not decoded — there is no file to read — and neither is anything the
 * platform refuses. Those tracks are given the seeded sample strip from
 * [sampleWaveformFor] instead of nothing: a bar that is a straight line reads as a
 * bug, and the sample is honest about being a sample because its shape says so.
 */
@Singleton
class WaveformAnalyzer @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val mutex = Mutex()
    private val memory = object : LinkedHashMap<String, FloatArray>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, FloatArray>?): Boolean =
            size > MEMORY_ENTRIES
    }
    /**
     * Server-measured strips, keyed by contentHash. A hosted channel episode is sampled
     * by the backend, so its strip is available even though the device only ever holds
     * a stream URL. Checked before decoding; bounded like [memory].
     */
    private val provided = object : LinkedHashMap<String, FloatArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, FloatArray>?): Boolean =
            size > PROVIDED_ENTRIES
    }

    /** Emits the heights as they are measured; a sample strip when nothing can be measured. */
    fun waveform(track: Track): Flow<FloatArray?> = flow {
        val key = track.contentHash
        cached(key)?.let { emit(it); return@flow }

        val uri = track.fileUri ?: track.streamUrl
        if (uri.isNullOrEmpty()) {
            emit(sample(key))
            return@flow
        }
        // A stream has no file to decode, so there is no loudness to read. Rather
        // than the flat rule that made the bar look broken, those tracks get the
        // seeded sample strip — deterministic, so a station looks the same every
        // time it is opened.
        if (isStreamUri(uri)) {
            emit(sample(key))
            return@flow
        }

        // One decode at a time: a skip through a folder must not stack codecs.
        val values = mutex.withLock {
            cached(key) ?: decode(uri) { partial -> emit(partial) }?.also {
                memory[key] = it
                write(key, it)
            }
        }
        // A container the platform refuses is indistinguishable, to the listener,
        // from a stream: either way there is no measurement, and either way the
        // sample is a better answer than a bare line. It is not cached, so a file
        // that starts decoding later still gets its real strip.
        emit(values ?: sample(key))
    }.flowOn(Dispatchers.IO)

    private fun sample(key: String): FloatArray = sampleWaveformFor(key)

    /**
     * Registers a server-measured strip (already normalised to [WAVEFORM_BUCKETS]).
     * [persist] writes it to the same contentHash-keyed disk cache the decoder uses,
     * so a hosted episode keeps its real bars offline and across restarts.
     */
    fun provide(key: String, values: FloatArray?, persist: Boolean = false) {
        if (values == null || values.isEmpty()) return
        synchronized(provided) { provided[key] = values }
        if (persist) write(key, values)
    }

    private fun cached(key: String): FloatArray? =
        synchronized(provided) { provided[key] } ?: synchronized(memory) { memory[key] } ?: read(key)

    // --- Decoding ---

    private suspend fun decode(uri: String, onPartial: suspend (FloatArray) -> Unit): FloatArray? {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            if (!open(extractor, uri)) return null
            val index = audioTrack(extractor) ?: return null
            extractor.selectTrack(index)
            val format = extractor.getTrackFormat(index)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
            val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
            if (durationUs <= 0L) return null
            val sampleRate = format.intOr(MediaFormat.KEY_SAMPLE_RATE, 44_100).coerceAtLeast(8_000)

            codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()

            val window = (sampleRate * WINDOW_MS / 1000).coerceAtLeast(256)
            val heights = FloatArray(WAVEFORM_BUCKETS)
            var last = 0f
            for (bucket in 0 until WAVEFORM_BUCKETS) {
                currentCoroutineContext().ensureActive()
                // The middle of the bucket, so the first bar is not always silence.
                val at = durationUs * bucket / WAVEFORM_BUCKETS + durationUs / WAVEFORM_BUCKETS / 2
                // A seek that lands past the end (or a decoder hiccup) repeats the
                // neighbour rather than dropping a hole into the strip.
                last = measure(extractor, codec, at, window)?.let(::waveformHeight) ?: last
                heights[bucket] = last
                if (bucket % PARTIAL_EVERY == PARTIAL_EVERY - 1) onPartial(heights.copyOf())
            }
            onPartial(heights)
            return heights
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Throwable) {
            // A container the platform will not decode is not an error the listener
            // should ever see; the scrubber simply keeps its plain line.
            return null
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { extractor.release() }
        }
    }

    /** RMS of roughly [window] mono samples around [atUs], or null when nothing decoded. */
    private fun measure(
        extractor: MediaExtractor,
        codec: MediaCodec,
        atUs: Long,
        window: Int,
    ): Float? {
        extractor.seekTo(atUs, MediaExtractor.SEEK_TO_NEXT_SYNC)
        codec.flush()
        val info = MediaCodec.BufferInfo()
        var energy = 0.0
        var counted = 0
        var channels = 2
        var pcmFloat = false
        var inputDone = false
        var attempts = 0

        while (counted < window && attempts < MAX_ATTEMPTS) {
            attempts++
            if (!inputDone) {
                val input = codec.dequeueInputBuffer(TIMEOUT_US)
                if (input >= 0) {
                    val buffer = codec.getInputBuffer(input)
                    val size = if (buffer == null) -1 else extractor.readSampleData(buffer, 0)
                    if (size < 0) {
                        codec.queueInputBuffer(input, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputDone = true
                    } else {
                        codec.queueInputBuffer(input, 0, size, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }
            when (val output = codec.dequeueOutputBuffer(info, TIMEOUT_US)) {
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val out = codec.outputFormat
                    channels = out.intOr(MediaFormat.KEY_CHANNEL_COUNT, channels).coerceIn(1, 8)
                    pcmFloat = out.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                        out.getInteger(MediaFormat.KEY_PCM_ENCODING) == android.media.AudioFormat.ENCODING_PCM_FLOAT
                }
                MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
                else -> if (output >= 0) {
                    val buffer = codec.getOutputBuffer(output)
                    if (buffer != null && info.size > 0) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        val taken = accumulate(buffer, channels, pcmFloat, window - counted, energy)
                        energy = taken.first
                        counted += taken.second
                    }
                    codec.releaseOutputBuffer(output, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                }
            }
        }
        return if (counted <= 0) null else rmsOf(energy, counted)
    }

    /** Adds one output buffer's energy; returns (energy, frames counted). */
    private fun accumulate(
        buffer: java.nio.ByteBuffer,
        channels: Int,
        pcmFloat: Boolean,
        remaining: Int,
        energy: Double,
    ): Pair<Double, Int> {
        var sum = energy
        var frames = 0
        if (pcmFloat) {
            val floats = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
            val total = min(floats.remaining() / channels, remaining)
            for (frame in 0 until total) {
                var mono = 0f
                for (channel in 0 until channels) mono += floats.get(frame * channels + channel)
                mono /= channels
                sum += (mono * mono).toDouble()
            }
            frames = total
        } else {
            val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
            val total = min(shorts.remaining() / channels, remaining)
            for (frame in 0 until total) {
                var mono = 0f
                for (channel in 0 until channels) mono += pcm16FullScale(shorts.get(frame * channels + channel))
                mono /= channels
                sum += (mono * mono).toDouble()
            }
            frames = total
        }
        return sum to frames
    }

    private fun open(extractor: MediaExtractor, uri: String): Boolean = runCatching {
        if (uri.startsWith("content://")) {
            extractor.setDataSource(context, android.net.Uri.parse(uri), null)
        } else {
            extractor.setDataSource(uri.removePrefix("file://"))
        }
        true
    }.getOrDefault(false)

    private fun audioTrack(extractor: MediaExtractor): Int? =
        (0 until extractor.trackCount).firstOrNull { index ->
            extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        }

    private fun MediaFormat.intOr(key: String, fallback: Int): Int =
        if (containsKey(key)) runCatching { getInteger(key) }.getOrDefault(fallback) else fallback

    // --- Cache ---

    private fun file(key: String): File = File(File(context.filesDir, CACHE_DIR), "$key.waveform")

    private fun read(key: String): FloatArray? = runCatching {
        val file = file(key)
        if (!file.isFile) return null
        DataInputStream(file.inputStream().buffered()).use { input ->
            if (input.readInt() != CACHE_MAGIC) return null
            if (input.readInt() != WAVEFORM_BUCKETS) return null
            FloatArray(WAVEFORM_BUCKETS) { input.readFloat() }
        }.also { synchronized(memory) { memory[key] = it } }
    }.getOrNull()

    private fun write(key: String, values: FloatArray) {
        runCatching {
            val directory = File(context.filesDir, CACHE_DIR)
            if (!directory.isDirectory && !directory.mkdirs()) return
            val target = file(key)
            val temporary = File(directory, "${key}.tmp")
            DataOutputStream(temporary.outputStream().buffered()).use { output ->
                output.writeInt(CACHE_MAGIC)
                output.writeInt(values.size)
                values.forEach(output::writeFloat)
            }
            // Atomic swap: a half-written cache must never be read as a waveform.
            if (!temporary.renameTo(target)) temporary.delete()
        }
    }

    private companion object {
        const val CACHE_DIR = "waveforms"
        const val CACHE_MAGIC = 0x57415645 // "WAVE"
        const val MEMORY_ENTRIES = 24
        const val PROVIDED_ENTRIES = 512
        const val WINDOW_MS = 60
        const val TIMEOUT_US = 6_000L
        const val MAX_ATTEMPTS = 200
        const val PARTIAL_EVERY = 12
    }
}
