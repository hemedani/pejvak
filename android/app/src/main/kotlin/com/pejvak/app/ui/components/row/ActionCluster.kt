package com.pejvak.app.ui.components.row

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * The trailing action cluster of a row.
 *
 * Two 44 dp bubbles butted straight together read as one wide smudge, and the second
 * one looks glued to the first — which is what "the icons have no margins" looks like.
 * Every row composes its actions through here so the gap is the same everywhere and
 * adding a third action cannot silently close it up.
 */
@Composable
fun ActionCluster(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}
