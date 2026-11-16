package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** Empty state — one of four distinct states (DESING.md §9.6). Never a blank list. */
@Composable
fun EmptyState(
    icon: String,
    title: String,
    modifier: Modifier = Modifier,
    body: String? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(
        modifier = modifier.fillMaxWidth().padding(geo.spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(geo.tiles.xl)
                .clip(CircleShape)
                .background(tokens.glassFill),
            contentAlignment = Alignment.Center,
        ) {
            PejvakIcon(name = icon, contentDescription = null, tint = tokens.textSecondary, size = geo.icons.xl)
        }
        Text(text = title, style = MaterialTheme.typography.headlineMedium, color = tokens.text, textAlign = TextAlign.Center)
        if (body != null) {
            Text(text = body, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary, textAlign = TextAlign.Center)
        }
    }
}

enum class NoticeTone { Info, Warning, Danger }

/** An inline notice (error/offline/warning) with an optional retry — not a bare caption. */
@Composable
fun InlineNotice(
    message: String,
    modifier: Modifier = Modifier,
    tone: NoticeTone = NoticeTone.Info,
    title: String? = null,
    retryLabel: String? = null,
    onRetry: (() -> Unit)? = null,
    action: @Composable (() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val accent = when (tone) {
        NoticeTone.Info -> tokens.accentTeal
        NoticeTone.Warning -> tokens.textSecondary
        NoticeTone.Danger -> tokens.danger
    }
    val icon = when (tone) {
        NoticeTone.Info -> "info"
        NoticeTone.Warning -> "warning"
        NoticeTone.Danger -> "error"
    }
    GlassSurface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(geo.radius.lg), rimLight = false) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(geo.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PejvakIcon(name = icon, contentDescription = null, tint = accent, size = geo.icons.lg)
            Column(
                modifier = Modifier.weight(1f).padding(horizontal = geo.spacing.md),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
            ) {
                if (title != null) {
                    Text(text = title, style = MaterialTheme.typography.titleSmall, color = tokens.text)
                }
                Text(text = message, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
                if (action != null) {
                    action()
                }
            }
            if (retryLabel != null && onRetry != null) {
                TextButton(onClick = onRetry) {
                    Text(text = retryLabel, color = accent)
                }
            }
        }
    }
}

/** Static skeleton rows (no shimmer loop) — the loading state. */
@Composable
fun SkeletonRows(
    modifier: Modifier = Modifier,
    count: Int = 5,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier, rimLight = false) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.lg)) {
            repeat(count) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(geo.tiles.md)
                            .clip(RoundedCornerShape(geo.radius.sm))
                            .background(tokens.glassFill),
                    )
                    Column(
                        modifier = Modifier.weight(1f).padding(start = geo.spacing.md),
                        verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                    ) {
                        Box(Modifier.fillMaxWidth(0.6f).height(12.dp).clip(CircleShape).background(tokens.glassFill))
                        Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(CircleShape).background(tokens.glassFill))
                    }
                }
            }
        }
    }
}