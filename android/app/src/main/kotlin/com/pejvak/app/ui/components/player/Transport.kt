package com.pejvak.app.ui.components.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.PlaybackPhase
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.delay

@Composable
fun TransportControls(
    isPlaying: Boolean,
    waiting: Boolean,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BubbleButton(
            icon = ICON_GLYPHS.getValue("previous"),
            contentDescription = stringResource(R.string.player_previous),
            onClick = onPrevious,
            size = geo.controls.lg,
        )
        BubbleButton(
            icon = ICON_GLYPHS.getValue("replay30"),
            contentDescription = stringResource(R.string.player_back_30),
            onClick = onRewind,
            size = geo.controls.lg,
        )
        if (waiting) {
            SpinnerRing(onClick = onToggle, size = geo.controls.play)
        } else {
            BubbleButton(
                icon = ICON_GLYPHS.getValue(if (isPlaying) "pause" else "play"),
                contentDescription = stringResource(if (isPlaying) R.string.player_pause else R.string.player_play),
                onClick = onToggle,
                size = geo.controls.play,
                filled = true,
            )
        }
        BubbleButton(
            icon = ICON_GLYPHS.getValue("forward30"),
            contentDescription = stringResource(R.string.player_forward_30),
            onClick = onForward,
            size = geo.controls.lg,
        )
        BubbleButton(
            icon = ICON_GLYPHS.getValue("next"),
            contentDescription = stringResource(R.string.player_next),
            onClick = onNext,
            size = geo.controls.lg,
        )
    }
}

@Composable
fun SpinnerRing(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 64.dp,
) {
    val tokens = LocalPejvakTokens.current
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(tokens.accent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            color = tokens.onAccent,
            strokeWidth = 2.dp,
            modifier = Modifier.size(size * 0.34f),
        )
    }
}

@Composable
fun PlaybackStatusLine(
    phase: PlaybackPhase,
    waitingSince: Long?,
    error: String?,
    modifier: Modifier = Modifier,
) {
    if (phase != PlaybackPhase.Connecting &&
        phase != PlaybackPhase.Buffering &&
        phase != PlaybackPhase.Error &&
        phase != PlaybackPhase.Ended
    ) {
        return
    }
    val tokens = LocalPejvakTokens.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(phase, waitingSince) {
        while (phase == PlaybackPhase.Connecting || phase == PlaybackPhase.Buffering) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val waitedLong = waitingSince != null && now - waitingSince > 8_000
    val label = when (phase) {
        PlaybackPhase.Connecting -> stringResource(if (waitedLong) R.string.player_connecting_long else R.string.player_connecting)
        PlaybackPhase.Buffering -> stringResource(if (waitedLong) R.string.player_buffering_long else R.string.player_buffering)
        PlaybackPhase.Error -> error ?: stringResource(R.string.player_failed)
        PlaybackPhase.Ended -> stringResource(R.string.player_finished)
    }
    val color = if (phase == PlaybackPhase.Error) tokens.danger else tokens.textSecondary
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        if (phase == PlaybackPhase.Connecting || phase == PlaybackPhase.Buffering) {
            CircularProgressIndicator(
                color = color,
                strokeWidth = 1.5.dp,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(label, style = MaterialTheme.typography.bodySmall, color = color)
    }
}
