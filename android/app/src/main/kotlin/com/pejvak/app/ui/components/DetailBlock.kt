package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The shared building blocks for detail screens (track detail, history stats). One place
 * so a label/value line can never repeat the starvation bug: the value column is always
 * weighted, so a long value wraps inside its own share instead of crushing the label to
 * one letter per line. Surfaces are the app's glass; the header bubble is the same teal
 * glow the sheets open on, so detail pages and modals read as one system.
 */

/** A small teal-glow icon bubble, matching the sheet header mark. */
@Composable
private fun SectionBubble(icon: String, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        modifier = modifier
            .size(geo.controls.sm)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    listOf(
                        tokens.accentTeal.copy(alpha = 0.34f),
                        tokens.glassFill,
                    ),
                ),
            )
            .border(1.dp, tokens.glassBorder, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        PejvakIcon(name = icon, contentDescription = null, tint = tokens.accentTeal, size = geo.icons.sm)
    }
}

/** A titled glass section: an icon bubble + overline heading above a [GlassCard]. */
@Composable
fun DetailSection(
    title: String,
    icon: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        ) {
            SectionBubble(icon)
            Text(
                text = title.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
        }
        GlassCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm), content = content)
        }
    }
}

/**
 * One label/value line. Blank values render nothing (the "hide empty" rule). The label
 * holds a single line; the value is right-aligned and wraps within its own weighted share,
 * so the two can never trade places and starve — the fix generalised from plan 04.
 */
@Composable
fun DetailRow(
    label: String,
    value: String?,
    modifier: Modifier = Modifier,
    icon: String? = null,
) {
    if (value.isNullOrBlank()) return
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier
                    .size(geo.tiles.sm)
                    .clip(CircleShape)
                    .background(tokens.glassFill),
                contentAlignment = Alignment.Center,
            ) {
                PejvakIcon(name = icon, contentDescription = null, tint = tokens.textSecondary, size = geo.icons.sm)
            }
        }
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(top = geo.spacing.xxs),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.text,
            textAlign = TextAlign.End,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1.3f),
        )
    }
}

/** A glass stat tile: a large tabular figure with a label (and an optional detail line). */
@Composable
fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    secondary: String? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xxs)) {
            Text(
                text = value,
                // Tabular figures so digits don't jitter between tiles (DESING.md §4).
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                color = tokens.text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
            if (!secondary.isNullOrBlank()) {
                Text(
                    text = secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textTertiary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** A compact pill chip for hero metadata (duration, format, origin). Blank text → nothing. */
@Composable
fun MetaChip(text: String?, icon: String? = null, modifier: Modifier = Modifier) {
    if (text.isNullOrBlank()) return
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(tokens.glassFill)
            .border(1.dp, tokens.glassBorder, CircleShape)
            .padding(horizontal = geo.spacing.md, vertical = geo.spacing.xs),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
        ) {
            if (icon != null) {
                PejvakIcon(name = icon, contentDescription = null, tint = tokens.textSecondary, size = geo.icons.xs)
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = tokens.text,
            )
        }
    }
}
