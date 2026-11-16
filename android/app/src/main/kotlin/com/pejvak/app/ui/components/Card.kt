package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** A content card — glass now (DESING.md §1), radius.card, padding 16. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    rimLight: Boolean = true,
    contentPadding: androidx.compose.foundation.layout.PaddingValues = androidx.compose.foundation.layout.PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    GlassSurface(
        modifier = modifier,
        shape = RoundedCornerShape(geo.radius.card),
        rimLight = rimLight,
    ) {
        Box(Modifier.padding(contentPadding)) { content() }
    }
}

/**
 * A grouped settings section (DESING.md §9.1): one glass card per topic, an optional
 * header, rows with inset hairline dividers, and an optional footer sentence.
 */
@Composable
fun CardSection(
    modifier: Modifier = Modifier,
    title: String? = null,
    footer: String? = null,
    content: @Composable () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(modifier = modifier.fillMaxWidth()) {
        if (title != null) {
            Text(
                text = title.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
                modifier = Modifier.padding(start = geo.spacing.lg, bottom = geo.spacing.sm),
            )
        }
        GlassCard(rimLight = false, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
            Column(Modifier.fillMaxWidth()) { content() }
        }
        if (footer != null) {
            Text(
                text = footer,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
                modifier = Modifier.padding(start = geo.spacing.lg, top = geo.spacing.sm),
            )
        }
    }
}

/**
 * A row inside a [CardSection]: leading glyph bubble, label + optional value/detail,
 * trailing slot. The section draws inset dividers between rows.
 */
@Composable
fun CardRow(
    label: String,
    modifier: Modifier = Modifier,
    icon: String? = null,
    value: String? = null,
    detail: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier
                    .size(geo.tiles.sm)
                    .clip(CircleShape)
                    .background(tokens.glassFill),
                contentAlignment = Alignment.Center,
            ) {
                PejvakIcon(name = icon, contentDescription = null, tint = tokens.text, size = geo.icons.md)
            }
            androidx.compose.foundation.layout.Spacer(Modifier.size(geo.spacing.md))
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (detail != null) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textTertiary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (value != null) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                modifier = Modifier.padding(start = geo.spacing.sm),
            )
        }
        if (trailing != null) {
            androidx.compose.foundation.layout.Spacer(Modifier.size(geo.spacing.sm))
            trailing()
        }
    }
}

/** Inset hairline divider between rows in a section (inset to the text). */
@Composable
fun RowDivider(modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = geo.spacing.lg)
            .height(1.dp)
            .background(tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.5f)),
    )
}

/**
 * A single-choice segmented control (DESING.md §9.3 — a chip is a filter, a segment
 * is a choice). Glass pill group; the selected segment fills with the accent.
 */
@Composable
fun SegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val shape = RoundedCornerShape(geo.radius.segment)
    val haptics = rememberHaptics()
    GlassSurface(modifier = modifier, shape = shape, rimLight = false) {
        Row(Modifier.fillMaxWidth().padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            options.forEachIndexed { index, label ->
                val selected = index == selectedIndex
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(geo.radius.md))
                        .then(if (selected) Modifier.background(tokens.accent) else Modifier.background(Color.Transparent))
                        .clickable {
                            haptics.trigger(HapticIntent.Select)
                            onSelect(index)
                        }
                        .padding(vertical = geo.spacing.sm),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) tokens.onAccent else tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}