package com.pejvak.app.ui.components.row

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.RowDivider
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.oceanEntrance

enum class RowPosition { First, Middle, Last, Only }

/**
 * The shared row anatomy (DESING.md §9.2): leading tile, copy (title/subtitle/meta),
 * one status line, and a planned action cluster. Never a surface itself — it composes
 * into [ListRow] / [RecordRow] inside a [ListGroup].
 */
@Composable
fun RowShell(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    meta: String? = null,
    status: StatusSpec? = null,
    leading: @Composable (() -> Unit)? = null,
    actions: List<RowAction> = emptyList(),
    maxInlineActions: Int = 2,
    trailing: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val layout = remember(actions, maxInlineActions) { planRowLayout(actions, maxInlineActions) }
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = geo.spacing.lg, vertical = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(geo.spacing.md))
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = tokens.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (meta != null) {
                Text(
                    text = meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (status != null) {
                StatusLine(spec = status, modifier = Modifier.padding(top = 2.dp))
            }
        }
        if (layout.inline.isNotEmpty() || layout.overflow.isNotEmpty()) {
            Spacer(Modifier.width(geo.spacing.sm))
            Row(verticalAlignment = Alignment.CenterVertically) {
                layout.inline.forEach { action ->
                    BubbleButton(
                        icon = com.pejvak.app.ui.components.ICON_GLYPHS.getValue(action.icon),
                        contentDescription = action.label,
                        onClick = action.onClick,
                        size = geo.controls.sm,
                    )
                }
                if (layout.overflow.isNotEmpty()) {
                    Box {
                        BubbleButton(
                            icon = com.pejvak.app.ui.components.ICON_GLYPHS.getValue("more"),
                            contentDescription = "More",
                            onClick = { menuOpen = true },
                            size = geo.controls.sm,
                        )
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            layout.overflow.forEach { action ->
                                DropdownMenuItem(
                                    text = { Text(action.label) },
                                    leadingIcon = {
                                        PejvakIcon(
                                            name = action.icon,
                                            contentDescription = null,
                                            tint = if (action.destructive) tokens.danger else tokens.text,
                                            size = geo.icons.md,
                                        )
                                    },
                                    onClick = { menuOpen = false; action.onClick() },
                                )
                            }
                        }
                    }
                }
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(geo.spacing.sm))
            trailing()
        }
    }
}

/**
 * One glass card wrapping a homogeneous sequence (DESING.md §9.2). Rows get a
 * [RowPosition] so the group reads as a single surface with inset dividers.
 */
@Composable
fun <T> ListGroup(
    items: List<T>,
    modifier: Modifier = Modifier,
    staggerRows: Boolean = false,
    rowContent: @Composable (item: T, position: RowPosition) -> Unit,
) {
    GlassCard(
        modifier = modifier,
        rimLight = false,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)
    ) {
        Column(Modifier.fillMaxWidth()) {
            items.forEachIndexed { index, item ->
                val position = when {
                    items.size == 1 -> RowPosition.Only
                    index == 0 -> RowPosition.First
                    index == items.lastIndex -> RowPosition.Last
                    else -> RowPosition.Middle
                }
                val rowModifier = if (staggerRows && items.size > 1 && index < 10) {
                    Modifier.oceanEntrance(
                        index = index,
                        riseDp = 8.dp,
                        swayDp = 3.dp,
                        startScale = 0.99f,
                        durationMs = 280,
                    )
                } else {
                    Modifier
                }
                Box(rowModifier) { rowContent(item, position) }
                if (index != items.lastIndex) RowDivider()
            }
        }
    }
}

/** A dense homogeneous row inside a [ListGroup]. */
@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    meta: String? = null,
    status: StatusSpec? = null,
    leading: @Composable (() -> Unit)? = null,
    actions: List<RowAction> = emptyList(),
    trailing: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) = RowShell(
    title = title,
    modifier = modifier,
    subtitle = subtitle,
    meta = meta,
    status = status,
    leading = leading,
    actions = actions,
    trailing = trailing,
    onClick = onClick,
)

/** A history/run record row: title, meta, one status line, timestamp on the end. */
@Composable
fun RecordRow(
    title: String,
    meta: String,
    modifier: Modifier = Modifier,
    status: StatusSpec? = null,
    timestamp: String? = null,
    leading: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            RowShell(title = title, meta = meta, status = status, leading = leading, onClick = onClick)
        }
        if (timestamp != null) {
            Text(
                text = timestamp,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
                modifier = Modifier.padding(end = 16.dp),
            )
        }
    }
}
