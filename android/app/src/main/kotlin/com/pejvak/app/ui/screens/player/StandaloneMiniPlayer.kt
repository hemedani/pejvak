package com.pejvak.app.ui.screens.player

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.pejvak.app.ui.components.FrostedSurface
import com.pejvak.app.ui.components.MiniPlayerRow
import com.pejvak.app.ui.components.NowPlayingUi
import com.pejvak.app.ui.components.dockElevation
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import kotlinx.coroutines.flow.StateFlow

/**
 * The mini-player on pushed screens (where the five-tab dock is not shown). Same
 * heavy-frost material as the dock, pill-shaped, with the same row so the two
 * cannot drift apart.
 */
@Composable
fun StandaloneMiniPlayer(
    nowPlaying: NowPlayingUi?,
    miniProgress: StateFlow<Float>? = null,
    miniWaveform: StateFlow<FloatArray?>? = null,
    onExpand: () -> Unit,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
    onClose: () -> Unit = {},
) {
    if (nowPlaying == null) return
    val geo = LocalPejvakGeometry.current
    FrostedSurface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(geo.radius.pill),
        softElevation = dockElevation(),
    ) {
        MiniPlayerRow(
            nowPlaying = nowPlaying,
            miniProgress = miniProgress,
            miniWaveform = miniWaveform,
            onPlayPause = onPlayPause,
            onNext = onNext,
            onExpand = onExpand,
            onClose = onClose,
            modifier = Modifier.height(geo.dock.playerHeight),
        )
    }
}
