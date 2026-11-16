package com.pejvak.app.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.pejvak.app.domain.buildRoomToneWav
import com.pejvak.app.domain.roomToneAmplitude
import com.pejvak.app.domain.toneAssetName
import com.pejvak.app.domain.toneFileName
import java.io.File

/**
 * The second, looping player that keeps the output stream from ever reaching
 * digital silence (the Bluetooth keep-alive). It is separate from the track
 * player on purpose: it must loop independently, never take audio focus, and
 * never be shaped by the enhancer.
 */
class TonePlayer(private val context: Context) {
    private val appContext = context.applicationContext
    private var player: ExoPlayer? = null
    private var currentTone: String? = null

    fun apply(toneId: String, level: Int, playing: Boolean) {
        if (level <= 0) {
            player?.pause()
            return
        }
        val item = mediaItem(toneId) ?: return
        val p = ensurePlayer() ?: return
        if (toneId != currentTone) {
            p.setMediaItem(item)
            p.prepare()
            currentTone = toneId
        }
        p.volume = roomToneAmplitude(level)
        if (playing && !p.isPlaying) p.play()
    }

    fun pause() {
        player?.pause()
    }

    fun release() {
        player?.release()
        player = null
        currentTone = null
    }

    private fun ensurePlayer(): ExoPlayer? = try {
        player ?: ExoPlayer.Builder(appContext).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus= */ false,
            )
            volume = 0f
        }.also { player = it }
    } catch (_: Throwable) {
        null
    }

    private fun mediaItem(toneId: String): MediaItem? {
        toneAssetName(toneId)?.let { return MediaItem.fromUri("asset:///$it") }
        val file = File(appContext.cacheDir, toneFileName(toneId))
        return try {
            if (!file.exists() || file.length() == 0L) file.writeBytes(buildRoomToneWav())
            MediaItem.fromUri(file.toURI().toString())
        } catch (_: Throwable) {
            null
        }
    }
}
