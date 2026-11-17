package com.pejvak.app.playback

import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Track
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * [PlayerCommand] backed by ExoPlayer. ExoPlayer is main-thread confined, so every
 * operation hops to the main looper. The service sets [player] in onCreate and
 * clears it in onDestroy. The engine calls this from its own serialized scope.
 */
@Singleton
class ExoPlayerCommand @Inject constructor(
    private val onlineCatalog: OnlineCatalogService,
) : PlayerCommand {

    var player: ExoPlayer? = null
    private val main = Handler(Looper.getMainLooper())

    override suspend fun loadAndPlay(track: Track, positionSec: Int) {
        // Signed online URLs expire; re-resolve before handing the URI to ExoPlayer.
        val playable = if (track.origin == Origin.Online && track.collectionKey != null) {
            runCatching { onlineCatalog.resolveTrack(track) }.getOrDefault(track)
        } else {
            track
        }
        val uri = playable.fileUri ?: playable.streamUrl ?: return
        withContext(Dispatchers.Main) {
            var active = player
            var attempts = 0
            while (active == null && attempts < 40) {
                delay(25)
                active = player
                attempts++
            }
            val p = active ?: return@withContext
            p.setMediaItem(MediaItem.fromUri(uri))
            p.seekTo(positionSec * 1000L)
            p.prepare()
            p.play()
        }
    }

    override fun pause() { main.post { player?.pause() } }
    override fun resume() { main.post { player?.play() } }
    override fun seekTo(positionSec: Int) { main.post { player?.seekTo(positionSec * 1000L) } }
    override fun setSpeed(speed: Double) { main.post { player?.setPlaybackSpeed(speed.toFloat()) } }
    override fun setVolume(amplitude: Float) { main.post { player?.volume = amplitude } }
    override fun release() { main.post { player?.stop(); player?.clearMediaItems() } }
}