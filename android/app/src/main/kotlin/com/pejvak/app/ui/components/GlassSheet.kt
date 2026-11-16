package com.pejvak.app.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A glass bottom sheet (DESING.md §9.1). Wraps Material3's ModalBottomSheet with the
 * Pejvak surface treatment: canvas-toned container, top-rounded xl corners, a glass
 * drag handle. Content composes glass rows/fields. Owns its insets.
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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = sheetState,
        containerColor = tokens.canvasBase,
        shape = RoundedCornerShape(topStart = geo.radius.xl, topEnd = geo.radius.xl),
        dragHandle = {
            Box(Modifier.fillMaxWidth().padding(top = geo.spacing.md), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(width = 36.dp, height = 4.dp)
                        .clip(RoundedCornerShape(geo.radius.pill))
                        .background(tokens.glassBorder),
                )
            }
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = geo.spacing.xxl)) {
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