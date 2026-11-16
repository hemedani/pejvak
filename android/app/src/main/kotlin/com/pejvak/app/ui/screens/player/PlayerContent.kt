package com.pejvak.app.ui.screens.player

import androidx.compose.animation.core.animate
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.AudioEnhancerSettings
import com.pejvak.app.domain.contextPositionLabel
import com.pejvak.app.domain.formatListened
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.domain.isEnhancerActive
import com.pejvak.app.domain.isWaiting
import com.pejvak.app.R
import com.pejvak.app.playback.PlayerState
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.UserText
import com.pejvak.app.ui.components.player.AnnotationList
import com.pejvak.app.ui.components.player.HeroArtwork
import com.pejvak.app.ui.components.player.LevelSliderRow
import com.pejvak.app.ui.components.player.PlaybackStatusLine
import com.pejvak.app.ui.components.player.PlayerChipRow
import com.pejvak.app.ui.components.player.Scrubber
import com.pejvak.app.ui.components.player.ScrubberMarker
import com.pejvak.app.ui.components.player.TransportControls
import com.pejvak.app.ui.components.player.markerColor
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.PejvakSpring
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlinx.coroutines.flow.StateFlow

@Composable
fun PlayerContent(
    state: PlayerState,
    positionFlow: StateFlow<Int>,
    listened: StateFlow<Int>,
    notes: List<Annotation>,
    enhancer: AudioEnhancerSettings,
    volume: Int,
    sleepRemaining: StateFlow<Int?>,
    toneLevel: Int,
    onClose: () -> Unit,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onSeek: (Int) -> Unit,
    onMarker: (Annotation) -> Unit,
    onAddNote: () -> Unit,
    onCycleSpeed: () -> Unit,
    onVolume: (Int) -> Unit,
    onToneLevel: (Int) -> Unit,
    onOpenTone: () -> Unit,
    onOpenQueue: () -> Unit,
    onOpenSleep: () -> Unit,
    onOpenJump: () -> Unit,
    onOpenEnhancer: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenContext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    var scale by remember { mutableFloatStateOf(1f) }
    var selectedNoteId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(state.trackId) {
        if (!motion || state.trackId == null) return@LaunchedEffect
        scale = 0.96f
        animate(0.96f, 1f, animationSpec = PejvakSpring.bouncy) { value, _ -> scale = value }
    }

    val position = contextPositionLabel(state.queueIndex, state.queue.size)
    val overline = state.context?.let { context ->
        listOfNotNull(context.type.name.uppercase(), position?.uppercase()).joinToString(" \u00b7 ")
    } ?: stringResource(R.string.player_now_playing).uppercase()

    Column(modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BubbleButton(
                icon = ICON_GLYPHS.getValue("close"),
                contentDescription = stringResource(R.string.player_close),
                onClick = onClose,
            )
            Text(
                text = stringResource(R.string.player_title),
                style = MaterialTheme.typography.headlineMedium,
                color = tokens.text,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            BubbleButton(
                icon = ICON_GLYPHS.getValue("queue"),
                contentDescription = stringResource(R.string.player_queue),
                onClick = onOpenQueue,
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.xxl),
        ) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val artSize = minOf(maxWidth, 340.dp)
                HeroArtwork(
                    size = artSize,
                    contentHash = state.contentHash,
                    title = state.title,
                    artworkUrl = state.artworkUrl,
                    modifier = Modifier.scale(scale).align(Alignment.Center),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = overline,
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                        modifier = Modifier.weight(1f),
                    )
                    ListenedReadout(listened = listened)
                }
                UserText(
                    text = state.title,
                    style = MaterialTheme.typography.titleLarge,
                    color = tokens.text,
                    maxLines = 2,
                )
                if (state.artist.isNotBlank()) {
                    UserText(
                        text = state.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.textSecondary,
                        maxLines = 1,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                ScrubberSection(
                    position = positionFlow,
                    durationSec = state.durationSec,
                    markers = notes.map { note ->
                        ScrubberMarker(note.id, note.positionSec, markerColor(note.color, tokens.accentTeal))
                    },
                    isPlaying = state.isPlaying,
                    waiting = isWaiting(state.phase),
                    onSeek = onSeek,
                    onMarkerClick = { id ->
                        notes.firstOrNull { it.id == id }?.let { note ->
                            selectedNoteId = note.id
                            onMarker(note)
                        }
                    },
                )
                PlaybackStatusLine(
                    phase = state.phase,
                    waitingSince = state.waiting?.since,
                    error = state.error,
                )
            }

            TransportControls(
                isPlaying = state.isPlaying,
                waiting = isWaiting(state.phase),
                onToggle = onToggle,
                onNext = onNext,
                onPrevious = onPrevious,
                onRewind = onRewind,
                onForward = onForward,
            )

            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                LevelSliderRow(
                    label = stringResource(R.string.player_volume),
                    value = volume,
                    onChange = onVolume,
                    icon = "volume",
                )
                LevelSliderRow(
                    label = stringResource(R.string.player_room_tone),
                    value = toneLevel,
                    onChange = onToneLevel,
                    icon = "music",
                    onLabelClick = onOpenTone,
                )
            }

            PlayerChipRow {
                state.context?.let { context ->
                    GlassChip(
                        label = context.title,
                        icon = if (context.type.name == "Folder") "folder" else "playlist",
                        onClick = onOpenContext,
                    )
                }
                if (state.queue.size > 1) {
                    GlassChip(label = stringResource(R.string.player_queue), icon = "queue", onClick = onOpenQueue)
                }
                GlassChip(
                    label = formatSpeed(state.playbackSpeed),
                    icon = "speed",
                    onClick = onCycleSpeed,
                )
                GlassChip(
                    label = stringResource(R.string.player_enhance),
                    icon = "enhancer",
                    selected = isEnhancerActive(enhancer),
                    onClick = onOpenEnhancer,
                )
                GlassChip(label = stringResource(R.string.player_ai), icon = "ai", onClick = onOpenAi)
                SleepChip(sleepRemaining = sleepRemaining, onClick = onOpenSleep)
                GlassChip(label = stringResource(R.string.player_go_to), icon = "time", onClick = onOpenJump)
                GlassChip(label = stringResource(R.string.player_note), icon = "add", onClick = onAddNote)
            }

            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = stringResource(R.string.player_notes).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = notes.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                }
                AnnotationList(
                    annotations = notes,
                    onSelect = { note ->
                        selectedNoteId = note.id
                        onMarker(note)
                    },
                    selectedId = selectedNoteId,
                )
            }

            Spacer(Modifier.height(geo.spacing.giant))
        }
    }
}

@Composable
private fun ListenedReadout(listened: StateFlow<Int>) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val listenedSec by listened.collectAsStateWithLifecycle()
    if (listenedSec <= 0) return
    Row(verticalAlignment = Alignment.CenterVertically) {
        PejvakIcon(
            name = "time",
            contentDescription = null,
            tint = tokens.textTertiary,
            size = geo.icons.xs,
        )
        Text(
            text = stringResource(R.string.player_listened, formatListened(listenedSec)),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textTertiary,
        )
    }
}

@Composable
private fun ScrubberSection(
    position: StateFlow<Int>,
    durationSec: Int,
    markers: List<ScrubberMarker>,
    isPlaying: Boolean,
    waiting: Boolean,
    onSeek: (Int) -> Unit,
    onMarkerClick: (String) -> Unit,
) {
    val positionSec by position.collectAsStateWithLifecycle()
    Scrubber(
        positionSec = positionSec,
        durationSec = durationSec,
        markers = markers,
        isPlaying = isPlaying,
        waiting = waiting,
        onSeek = onSeek,
        onMarkerClick = onMarkerClick,
    )
}

@Composable
private fun SleepChip(sleepRemaining: StateFlow<Int?>, onClick: () -> Unit) {
    val remaining by sleepRemaining.collectAsStateWithLifecycle()
    val active = remaining != null && remaining!! > 0
    val label = if (active) {
        stringResource(R.string.player_sleep_n, (remaining!! + 59) / 60)
    } else {
        stringResource(R.string.player_sleep)
    }
    GlassChip(
        label = label,
        icon = "sleep",
        selected = active,
        onClick = onClick,
    )
}
