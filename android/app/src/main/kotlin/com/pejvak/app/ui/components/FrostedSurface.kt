package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.rememberPejvakFrost
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazePerformanceMode
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.blur.hazeBlur

/** The one Haze graph for the shell. Null outside it (e.g. the dev gallery). */
val LocalHazeState = staticCompositionLocalOf<HazeState?> { null }

/** Clearance the floating dock occupies, measured in the shell (not a literal). */
data class ShellInsets(val bottom: Dp = 0.dp)

val LocalShellInsets = staticCompositionLocalOf { ShellInsets() }

/**
 * A frosted shell pane: the Haze material, clipped to [shape], with the same 3 dp
 * top rim light and hairline border as the light glass cards. Content drawn inside
 * stays crisp — Haze blurs the backdrop, never this pane's own children.
 */
@Composable
fun FrostedSurface(
    modifier: Modifier = Modifier,
    shape: Shape,
    softElevation: Dp = 0.dp,
    borderWidth: Dp = 1.dp,
    frostBlur: Dp? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val haze = LocalHazeState.current
    val style = rememberPejvakFrost(frostBlur ?: LocalPejvakGeometry.current.frost.blur)
    val shadowModifier = if (softElevation > 0.dp) {
        Modifier.shadow(
            elevation = softElevation,
            shape = shape,
            clip = false,
            ambientColor = Color.Black.copy(alpha = 0.22f),
            spotColor = Color.Black.copy(alpha = 0.28f),
        )
    } else {
        Modifier
    }
    Box(
        modifier = modifier
            .then(shadowModifier)
            .clip(shape)
            .then(
                if (haze != null) {
                    Modifier.hazeBlur(
                        input = HazeInput.Sources(haze),
                        style = style,
                        performanceMode = HazePerformanceMode.Balanced,
                        expandLayerBounds = true,
                    )
                } else {
                    // Gallery / previews outside the shell: the same smoked material,
                    // without a source to sample.
                    Modifier.background(tokens.frostFallback)
                },
            )
            .drawWithContent {
                drawContent()
                val rim = 3.dp.toPx()
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(tokens.glassHighlight, Color.Transparent),
                        startY = 0f,
                        endY = rim,
                    ),
                    topLeft = Offset.Zero,
                    size = Size(size.width, rim),
                )
            }
            .border(borderWidth, tokens.glassBorder, shape),
        content = content,
    )
}

/** The shell's soft dock elevation (DESING.md §6: no hard shadows). */
@Composable
fun dockElevation(): Dp = LocalPejvakGeometry.current.spacing.sm
