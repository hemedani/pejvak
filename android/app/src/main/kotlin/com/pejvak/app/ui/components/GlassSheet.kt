package com.pejvak.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Tracks how many modal sheets are composed so the app shell can blur the content
 * behind them. A sheet renders in its own dialog window, so blurring the nav
 * content frosts the activity window behind the sheet while the sheet itself stays
 * crisp — the glass backdrop.
 */
class SheetPresence {
    var count by mutableStateOf(0)
        internal set
}

val LocalSheetPresence = staticCompositionLocalOf<SheetPresence?> { null }

/**
 * A glass bottom sheet (DESING.md §9.1). Wraps Material3's ModalBottomSheet with the
 * Pejvak surface treatment: a floating xl-rounded canvas panel with a white glass
 * stroke and margins on the sides and bottom, plus a glass drag handle. Content
 * composes glass rows/fields. Owns its insets. While composed it raises
 * [LocalSheetPresence] so the shell frosts the content behind it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlassSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val presence = LocalSheetPresence.current
    DisposableEffect(presence) {
        presence?.let { it.count++ }
        onDispose { presence?.let { it.count-- } }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val shape = RoundedCornerShape(geo.radius.xl)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier.padding(
            start = geo.spacing.sm,
            end = geo.spacing.sm,
            bottom = geo.spacing.sm,
        ),
        sheetState = sheetState,
        containerColor = tokens.canvasBase,
        tonalElevation = 0.dp,
        scrimColor = Color.Black.copy(alpha = 0.35f),
        shape = shape,
        dragHandle = null,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .border(BorderStroke(1.dp, tokens.glassBorder), shape)
                .padding(top = geo.spacing.md, bottom = geo.spacing.lg)
                .padding(horizontal = geo.spacing.xxl),
        ) {
            Box(Modifier.fillMaxWidth().padding(bottom = geo.spacing.md), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(width = 36.dp, height = 4.dp)
                        .clip(RoundedCornerShape(geo.radius.pill))
                        .background(tokens.glassBorder),
                )
            }
            if (title != null) {
                androidx.compose.material3.Text(
                    text = title,
                    style = androidx.compose.material3.MaterialTheme.typography.headlineMedium,
                    color = tokens.text,
                    modifier = Modifier.padding(bottom = geo.spacing.lg),
                )
            }
            content()
        }
    }
}