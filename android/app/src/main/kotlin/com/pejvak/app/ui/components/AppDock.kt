package com.pejvak.app.ui.components

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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.ui.components.player.WavyProgress
import com.pejvak.app.ui.navigation.Tab
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

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
 * The dock (DESING.md §9.5): mini-player + five icon-only destinations in ONE
 * strong-glass panel. One panel makes overlap structurally impossible; both halves
 * are equal height. Selected destination = a solid white accent circle with the
 * glyph knocked out. No raised centre action, no per-tab labels.
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
    GlassSurface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(geo.radius.xl),
        filled = false,
    ) {
        Column(Modifier.fillMaxWidth()) {
            if (nowPlaying != null) {
                MiniPlayerRow(
                    nowPlaying = nowPlaying,
                    miniProgress = miniProgress,
                    miniWaveform = miniWaveform,
                    onPlayPause = onPlayPause,
                    onNext = onNext,
                    onExpand = onExpand,
                    modifier = Modifier.height(geo.dock.playerHeight),
                )
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
                    DockItem(tab = tab, selected = selected, onClick = { onSelect(tab) })
                }
            }
        }
    }
}

@Composable
private fun DockItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        modifier = Modifier
            .size(geo.dock.touch)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Box(
                modifier = Modifier
                    .size(geo.dock.indicator)
                    .clip(CircleShape)
                    .background(tokens.accent),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = tab.icon,
                    contentDescription = null,
                    tint = tokens.onAccent,
                    modifier = Modifier.size(geo.dock.iconActive),
                )
            }
        } else {
            Icon(
                imageVector = tab.icon,
                contentDescription = null,
                tint = tokens.textSecondary,
                modifier = Modifier.size(geo.dock.icon),
            )
        }
    }
}

@Composable
private fun MiniPlayerRow(
    nowPlaying: NowPlayingUi,
    miniProgress: StateFlow<Float>?,
    miniWaveform: StateFlow<FloatArray?>?,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    onExpand: () -> Unit,
    modifier: Modifier = Modifier,
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
        // Artwork tile, or the track's deterministic aurora ramp when none.
        PaletteTile(
            contentHash = nowPlaying.contentHash,
            label = nowPlaying.title,
            artworkUrl = nowPlaying.artworkUrl,
            size = geo.tiles.md,
        )
        Spacer(Modifier.width(geo.spacing.md))
        Column(Modifier.weight(1f)) {
            Text(
                text = nowPlaying.title,
                style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                color = tokens.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = nowPlaying.artist,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
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
