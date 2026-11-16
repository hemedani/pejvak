package com.pejvak.app.ui.components.row

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

enum class StatusTone { Neutral, Positive, Warning, Danger }

/**
 * One status vocabulary (DESING.md §9.2). Each domain maps its own states to a
 * [StatusSpec]; [StatusLine] owns the glyph. A row carries at most one status line.
 */
data class StatusSpec(
    val kind: String,
    val label: String,
    val tone: StatusTone = StatusTone.Neutral,
)

private fun glyphFor(kind: String): String = when (kind) {
    "downloaded", "complete", "synced", "finished" -> "check"
    "downloading", "syncing", "pending" -> "sync"
    "failed", "error" -> "error"
    "missing" -> "warning"
    "cancelled", "paused" -> "pause"
    "streaming", "online" -> "online"
    "favorite" -> "favorite"
    else -> "info"
}

@Composable
fun StatusLine(spec: StatusSpec, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val color: Color = when (spec.tone) {
        StatusTone.Positive -> tokens.accentTeal
        StatusTone.Warning -> tokens.textSecondary
        StatusTone.Danger -> tokens.danger
        StatusTone.Neutral -> tokens.textTertiary
    }
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        PejvakIcon(name = glyphFor(spec.kind), contentDescription = null, tint = color, size = geo.icons.sm)
        Text(
            text = spec.label,
            style = MaterialTheme.typography.bodySmall,
            color = color,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
}