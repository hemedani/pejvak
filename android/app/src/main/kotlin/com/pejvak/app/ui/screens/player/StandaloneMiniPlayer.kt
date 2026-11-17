package com.pejvak.app.ui.screens.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassSurface
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.NowPlayingUi
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.player.WavyProgress
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

@Composable
fun StandaloneMiniPlayer(
    nowPlaying: NowPlayingUi?,
    miniProgress: StateFlow<Float>? = null,
    miniWaveform: StateFlow<FloatArray?>? = null,
    onExpand: () -> Unit,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (nowPlaying == null) return
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSurface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(geo.radius.lg),
        filled = false,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(geo.dock.playerHeight)
                .clickable(onClick = onExpand)
                .padding(horizontal = geo.dock.inset),
            verticalAlignment = Alignment.CenterVertically,
        ) {
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
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = nowPlaying.artist,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (miniProgress != null) {
                    val value by miniProgress.collectAsStateWithLifecycle()
                    val bars by (miniWaveform ?: remember { MutableStateFlow<FloatArray?>(null) })
                        .collectAsStateWithLifecycle()
                    WavyProgress(
                        progress = value,
                        isPlaying = nowPlaying.isPlaying,
                        waiting = nowPlaying.waiting,
                        waveform = bars,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
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
}
