package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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

/**
 * A filter chip (DESING.md §9.3 — a chip is a filter, a segment is a choice). The
 * optional [count] renders a badge in place of the icon so a chip row never clips
 * when a query is typed. Floating tab chips under [GlassHeader] pass [frosted] = true
 * so unselected pills share the same crystalline backdrop blur as the header and dock.
 */
@Composable
fun GlassChip(
    label: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    frosted: Boolean = false,
    icon: String? = null,
    count: Int? = null,
    onClick: () -> Unit = {},
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val shape = RoundedCornerShape(geo.radius.pill)
    val contentColor = if (selected) tokens.onAccent else tokens.text
    val haptics = rememberHaptics()
    val handleClick = {
        haptics.trigger(HapticIntent.Select)
        onClick()
    }

    if (frosted && !selected) {
        FrostedSurface(
            modifier = modifier
                .clip(shape)
                .clickable(onClick = handleClick),
            shape = shape,
        ) {
            ChipContent(
                label = label,
                icon = icon,
                count = count,
                contentColor = contentColor,
            )
        }
    } else {
        val fill = if (selected) tokens.accent else tokens.glassFill
        Row(
            modifier = modifier
                .clip(shape)
                .background(fill)
                .border(1.dp, tokens.glassBorder, shape)
                .clickable(onClick = handleClick),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChipContent(
                label = label,
                icon = icon,
                count = count,
                contentColor = contentColor,
            )
        }
    }
}

@Composable
private fun ChipContent(
    label: String,
    icon: String?,
    count: Int?,
    contentColor: Color,
) {
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier.padding(horizontal = geo.spacing.md, vertical = geo.spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (count != null) {
            Text(text = count.toString(), style = MaterialTheme.typography.labelLarge, color = contentColor)
            Spacer(Modifier.size(geo.spacing.xs))
        } else if (icon != null) {
            PejvakIcon(name = icon, contentDescription = null, tint = contentColor, size = geo.icons.sm)
            Spacer(Modifier.size(geo.spacing.xs))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = contentColor,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
        )
    }
}
