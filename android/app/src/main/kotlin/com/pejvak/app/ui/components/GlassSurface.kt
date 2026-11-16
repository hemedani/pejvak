package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The base glass pane (DESING.md §6): translucent fill + bright hairline border +
 * a 3 dp top rim light. Depth comes from this trio over the ambient canvas, not
 * from drop shadows.
 *
 * Real backdrop blur (RenderEffect, API 31+) is a Phase-1 refinement; the
 * translucent recipe is the designed fallback and is legible on its own — the
 * mid-tone canvas guarantees contrast. [strong] uses the higher-opacity fill for
 * the dock / sheets that must read over busy content.
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(28.dp),
    strong: Boolean = false,
    rimLight: Boolean = true,
    borderWidth: Dp = 1.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val fill = if (strong) tokens.glassFillStrong else tokens.glassFill
    Box(
        modifier = modifier
            .clip(shape)
            .background(fill)
            .then(
                if (rimLight) Modifier.drawWithContent {
                    drawContent()
                    // Top-edge rim light only — never a half-pane highlight.
                    val rim = 3.dp.toPx()
                    drawRect(
                        brush = Brush.verticalGradient(
                            colors = listOf(tokens.glassHighlight, Color.Transparent),
                            startY = 0f,
                            endY = rim,
                        ),
                        topLeft = Offset.Zero,
                        size = androidx.compose.ui.geometry.Size(size.width, rim),
                    )
                } else Modifier,
            )
            .border(borderWidth, tokens.glassBorder, shape),
        content = content,
    )
}