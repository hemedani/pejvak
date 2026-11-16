package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.data.download.DownloadSummary
import com.pejvak.app.domain.DownloadState
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One download verb set (DESING.md §9.2). The row always shows where the queue
 * stands; the buttons only ever offer what is true for that state.
 */
@Composable
fun DownloadControl(
    summary: DownloadSummary?,
    onStart: () -> Unit,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    compact: Boolean = false,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val state = summary?.state ?: DownloadState.None
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
        if (!compact) {
            Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                when (state) {
                    DownloadState.None -> GlassChip(
                        label = stringResource(R.string.download_start),
                        icon = "download",
                        onClick = onStart,
                    )
                    DownloadState.Downloading -> {
                        GlassChip(label = stringResource(R.string.download_cancel), icon = "pause", onClick = onCancel)
                    }
                    DownloadState.Cancelled -> {
                        GlassChip(label = stringResource(R.string.download_resume), icon = "play", onClick = onRetry)
                        GlassChip(label = stringResource(R.string.download_delete), icon = "trash", onClick = onDelete)
                    }
                    DownloadState.Failed -> {
                        GlassChip(label = stringResource(R.string.download_retry), icon = "refresh", onClick = onRetry)
                        GlassChip(label = stringResource(R.string.download_delete), icon = "trash", onClick = onDelete)
                    }
                    DownloadState.Complete -> {
                        GlassChip(label = stringResource(R.string.download_delete), icon = "trash", onClick = onDelete)
                    }
                }
            }
        }
        if (summary != null && summary.total > 0) {
            Text(
                text = summaryLine(summary, busy),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = geo.spacing.xs)
                    .height(geo.bars.thin)
                    .clip(RoundedCornerShape(geo.radius.pill))
                    .background(tokens.glassBorder),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth((summary.done.toFloat() / summary.total.toFloat()).coerceIn(0f, 1f))
                        .height(geo.bars.thin)
                        .clip(RoundedCornerShape(geo.radius.pill))
                        .background(tokens.accentTeal),
                )
            }
        }
    }
}

@Composable
private fun summaryLine(summary: DownloadSummary, busy: Boolean): String {
    val verb = when (summary.state) {
        DownloadState.Complete -> stringResource(R.string.download_complete)
        DownloadState.Downloading -> stringResource(R.string.download_downloading)
        DownloadState.Failed -> stringResource(R.string.download_failed)
        DownloadState.Cancelled -> stringResource(R.string.download_paused)
        DownloadState.None -> stringResource(R.string.download_none)
    }
    val progress = stringResource(R.string.download_progress, summary.done, summary.total)
    val percent = if (summary.bytesTotal > 0) " · ${summary.percent}%" else ""
    return "$verb · $progress$percent" + if (busy) " · …" else ""
}
