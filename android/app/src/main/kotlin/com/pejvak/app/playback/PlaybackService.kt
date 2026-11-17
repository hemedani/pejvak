package com.pejvak.app.playback

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.pejvak.app.data.remote.online.OnlineRegistry
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The single owner of playback: a Media3 [MediaSessionService] so background audio,
 * lock-screen controls, the media notification, Bluetooth/headset buttons and Android
 * controls and the media notification come from the platform. ExoPlayer events feed the [PlaybackEngine] (sessions,
 * runs, stretches, checkpoints); external controller commands route through the engine
 * too, so a lock-screen pause still finalizes a session. Android Auto browse is not
 * implemented (retired in the parity audit).
 *
 * Runtime playback is verified on-device by the owner; the orchestration logic is
 * JVM-tested separately (PlaybackEngineTest).
 */
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    @Inject lateinit var engine: PlaybackEngine
    @Inject lateinit var command: ExoPlayerCommand
    @Inject lateinit var syncScheduler: com.pejvak.app.data.sync.SyncScheduler
    @Inject lateinit var effects: AudioEffectsController
    @Inject lateinit var onlineRegistry: OnlineRegistry

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    // Serialized so player events reach the engine in order.
    private val engineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default.limitedParallelism(1))
    private val handler = Handler(Looper.getMainLooper())

    private val tick = object : Runnable {
        override fun run() {
            readProgress()
            if (engine.sleepTimer.shouldPause(System.currentTimeMillis())) {
                engineScope.launch { engine.pause() }
            }
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        // startForegroundService() gives the service five seconds to post a
        // notification. Building the session and resolving a track can take
        // longer than that, so promote immediately with a placeholder; Media3
        // later updates the same notification id with the real media controls.
        startForeground(DEFAULT_NOTIFICATION_ID, buildPlaceholderNotification())
        val audioSessionId = (getSystemService(AUDIO_SERVICE) as? AudioManager)
            ?.generateAudioSessionId() ?: 0
        val exoPlayer = ExoPlayer.Builder(this).build().apply {
            if (audioSessionId > 0) setAudioSessionId(audioSessionId)
            val attributes = AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()
            setAudioAttributes(attributes, /* handleAudioFocus= */ true)
            addListener(playerListener)
        }
        player = exoPlayer
        command.player = exoPlayer
        effects.bind(exoPlayer, audioSessionId)
        mediaSession = MediaSession.Builder(this, exoPlayer)
            .setCallback(MediaButtonCallback())
            .build()
            .also { addSession(it) }
        // A finalized session is the highest-value moment to push; WorkManager
        // coalesces this with any sync already queued.
        engine.onSessionFinalized = { syncScheduler.syncNow() }
        engine.onPlaybackStarted = { track ->
            val sourceId = track.sourceId
            val externalId = track.externalId
            if (sourceId != null && externalId != null) {
                runCatching { onlineRegistry.adapter(sourceId)?.notePlaybackStarted(externalId) }
            }
        }
        effects.syncPlayback(false)
        engineScope.launch { engine.recoverOrphanedSessions() }
        handler.post(tick)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    private fun buildPlaceholderNotification(): android.app.Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(DEFAULT_CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    DEFAULT_CHANNEL_ID,
                    getString(com.pejvak.app.R.string.app_name),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { setShowBadge(false) },
            )
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pending = launch?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        return NotificationCompat.Builder(this, DEFAULT_CHANNEL_ID)
            .setSmallIcon(androidx.media3.session.R.drawable.media3_notification_small_icon)
            .setContentTitle(getString(com.pejvak.app.R.string.app_name))
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        effects.unbind()
        command.player = null
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        player = null
        engineScope.cancel()
        super.onDestroy()
    }

    private fun readProgress() {
        val p = player ?: return
        val positionSec = (p.currentPosition / 1000).toInt()
        val durationSec = if (p.duration > 0) (p.duration / 1000).toInt() else 0
        val playing = p.isPlaying
        effects.syncPlayback(playing)
        val buffering = p.playbackState == Player.STATE_BUFFERING
        val now = System.currentTimeMillis()
        engineScope.launch { engine.onPlayerProgress(positionSec, durationSec, playing, buffering, now) }
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) {
                engineScope.launch { engine.onPlayerFinished() }
            }
            if (state == Player.STATE_IDLE) effects.releaseTransport()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            // React immediately to play/pause rather than waiting for the next tick.
            effects.syncPlayback(isPlaying)
            readProgress()
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            engineScope.launch { engine.onPlayerError(error.message ?: "Playback error") }
        }
    }

    /**
     * Transport (play/pause/seek) goes straight to the player and the engine observes
     * it via the listener — so a lock-screen pause still finalizes a session. Hardware
     * next/previous are routed through the engine so they advance the managed queue.
     */
    private inner class MediaButtonCallback : MediaSession.Callback {
        override fun onMediaButtonEvent(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            intent: android.content.Intent,
        ): Boolean {
            val event = androidx.core.content.IntentCompat.getParcelableExtra(
                intent, android.content.Intent.EXTRA_KEY_EVENT, android.view.KeyEvent::class.java,
            ) ?: return false
            if (event.action != android.view.KeyEvent.ACTION_DOWN) return false
            return when (event.keyCode) {
                android.view.KeyEvent.KEYCODE_MEDIA_NEXT -> { engineScope.launch { engine.next() }; true }
                android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS -> { engineScope.launch { engine.previous() }; true }
                else -> false
            }
        }
    }

    companion object {
        private const val TICK_MS = 1000L
        private const val DEFAULT_CHANNEL_ID = DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID
        private const val DEFAULT_NOTIFICATION_ID = DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID

        fun start(context: android.content.Context) {
            androidx.core.content.ContextCompat.startForegroundService(
                context,
                android.content.Intent(context, PlaybackService::class.java),
            )
        }
    }
}