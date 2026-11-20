package com.pejvak.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.components.player.WavyProgress
import com.pejvak.app.ui.navigation.Tab
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The dock's now-playing half. Only the fields the mini-player draws, so a
 *  once-a-second position tick never recomposes the dock; the progress wave
 *  collects its own flow in a leaf. */
data class NowPlayingUi(
    val title: String,
    val artist: String,
    val isPlaying: Boolean,
    val artworkUrl: String? = null,
    val contentHash: String? = null,
    val waiting: Boolean = false,
)

/**
 * The dock (DESING.md §9.5 / plan 02 §4): one heavy-frost capsule with a
 * mini-player half and five icon-only destinations. The selected destination is a
 * solid white accent circle with the glyph knocked out; there is no travel
 * animation on tab switch — the press spring and haptic are the interaction.
 */
@Composable
fun AppDock(
    selectedRoute: String,
    onSelect: (Tab) -> Unit,
    modifier: Modifier = Modifier,
    nowPlaying: NowPlayingUi? = null,
    miniProgress: StateFlow<Float>? = null,
    miniWaveform: StateFlow<FloatArray?>? = null,
    onPlayPause: () -> Unit = {},
    onNext: () -> Unit = {},
    onExpand: () -> Unit = {},
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    val shape = if (nowPlaying != null) {
        RoundedCornerShape(geo.radius.xl)
    } else {
        RoundedCornerShape(geo.radius.pill)
    }
    FrostedSurface(
        modifier = modifier.fillMaxWidth(),
        shape = shape,
        softElevation = dockElevation(),
    ) {
        Column(Modifier.fillMaxWidth()) {
            AnimatedVisibility(
                visible = nowPlaying != null,
                enter = if (motion) expandVertically() + fadeIn() else expandVertically { 0 },
                exit = if (motion) shrinkVertically() + fadeOut() else shrinkVertically { 0 },
            ) {
                nowPlaying?.let { playing ->
                    Column {
                        MiniPlayerRow(
                            nowPlaying = playing,
                            miniProgress = miniProgress,
                            miniWaveform = miniWaveform,
                            onPlayPause = onPlayPause,
                            onNext = onNext,
                            onExpand = onExpand,
                            modifier = Modifier.height(geo.dock.playerHeight),
                        )
                        HairlineWave(
                            Modifier
                                .padding(horizontal = geo.dock.inset)
                                .height(geo.spacing.sm),
                            color = tokens.glassBorder,
                        )
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(geo.dock.navHeight)
                    .padding(horizontal = geo.dock.inset),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Tab.entries.forEach { tab ->
                    val selected = tab.route == selectedRoute
                    DockItem(
                        tab = tab,
                        selected = selected,
                        description = stringResource(tab.labelRes),
                        onClick = { onSelect(tab) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DockItem(tab: Tab, selected: Boolean, description: String, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val scale = remember { Animatable(1f) }
    Box(
        modifier = Modifier
            .size(geo.dock.touch)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
            }
            .clip(CircleShape)
            .clickable {
                haptics.trigger(HapticIntent.Select)
                if (motion) {
                    scope.launch {
                        scale.animateTo(0.92f, spring(stiffness = Spring.StiffnessHigh))
                        scale.animateTo(1.05f, spring(stiffness = Spring.StiffnessHigh))
                        scale.animateTo(1f, spring(stiffness = Spring.StiffnessMedium))
                    }
                }
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            // A static halo, not a moving ring: it lifts the white circle off the
            // dock without becoming a second animation.
            Box(
                modifier = Modifier
                    .size(geo.dock.indicator + geo.spacing.xs)
                    .clip(CircleShape)
                    .background(tokens.accent.copy(alpha = 0.18f)),
            )
            Box(
                modifier = Modifier
                    .size(geo.dock.indicator)
                    .clip(CircleShape)
                    .background(tokens.accent),
                contentAlignment = Alignment.Center,
            ) {
                PejvakIcon(
                    name = tabRouteGlyph(tab),
                    contentDescription = description,
                    tint = tokens.onAccent,
                    size = geo.dock.iconActive,
                )
            }
        } else {
            PejvakIcon(
                name = tabRouteGlyph(tab),
                contentDescription = description,
                tint = tokens.textSecondary,
                size = geo.dock.icon,
            )
        }
    }
}

/** The dock's glyph names, routed through the one icon family. */
private fun tabRouteGlyph(tab: Tab): String = when (tab) {
    Tab.Library -> "music"
    Tab.History -> "history"
    Tab.Discover -> "discover"
    Tab.Notes -> "notes"
    Tab.Ai -> "ai"
}

@Composable
fun MiniPlayerRow(
    nowPlaying: NowPlayingUi,
    miniProgress: StateFlow<Float>?,
    miniWaveform: StateFlow<FloatArray?>?,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    onExpand: () -> Unit,
    modifier: Modifier = Modifier,
    tileAlpha: Float = 1f,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onExpand)
            .padding(horizontal = geo.dock.inset),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PaletteTile(
            contentHash = nowPlaying.contentHash,
            label = nowPlaying.title,
            artworkUrl = nowPlaying.artworkUrl,
            size = geo.tiles.md,
            modifier = if (tileAlpha < 1f) Modifier.graphicsLayer { alpha = tileAlpha } else Modifier,
        )
        Spacer(Modifier.width(geo.spacing.md))
        Column(Modifier.weight(1f)) {
            UserText(
                text = nowPlaying.title,
                style = MaterialTheme.typography.titleMedium,
                color = tokens.text,
                maxLines = 1,
            )
            UserText(
                text = nowPlaying.artist,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
                maxLines = 1,
            )
            if (miniProgress != null) {
                MiniWave(
                    progress = miniProgress,
                    waveform = miniWaveform,
                    isPlaying = nowPlaying.isPlaying,
                    waiting = nowPlaying.waiting,
                )
            }
        }
        Spacer(Modifier.width(geo.spacing.sm))
        BubbleButton(
            icon = ICON_GLYPHS.getValue(if (nowPlaying.isPlaying) "pause" else "play"),
            contentDescription = stringResource(if (nowPlaying.isPlaying) R.string.player_pause else R.string.player_play),
            onClick = onPlayPause,
            size = geo.controls.md,
            filled = true,
        )
        Spacer(Modifier.width(geo.spacing.xs))
        BubbleButton(
            icon = ICON_GLYPHS.getValue("next"),
            contentDescription = stringResource(R.string.player_next),
            onClick = onNext,
            size = geo.controls.md,
        )
    }
}

@Composable
private fun MiniWave(
    progress: StateFlow<Float>,
    waveform: StateFlow<FloatArray?>?,
    isPlaying: Boolean,
    waiting: Boolean,
) {
    val value by progress.collectAsStateWithLifecycle()
    val bars by (waveform ?: remember { MutableStateFlow<FloatArray?>(null) })
        .collectAsStateWithLifecycle()
    WavyProgress(
        progress = value,
        isPlaying = isPlaying,
        waiting = waiting,
        waveform = bars,
        modifier = Modifier.padding(top = 2.dp),
    )
}
