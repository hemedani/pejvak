package com.pejvak.app.ui.components

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.clip
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

/** Clearance the floating dock occupies, measured in the shell (not a literal). */
data class ShellInsets(val bottom: Dp = 0.dp)

val LocalShellInsets = staticCompositionLocalOf { ShellInsets() }

/**
 * A frosted shell pane. The pane's background is the shell [Backdrop] drawn through a
 * [BackdropBlur] — the recorded content, blurred — then the smoked scrim and the milk
 * sheen from the theme, the 3 dp top rim and a hairline border. The pane's own children
 * stay crisp: the blur is applied to the backdrop, never to this pane's content.
 *
 * Without a backdrop (the dev gallery) or on API 29–30 (no RenderEffect) the pane draws
 * the fallback tint instead, which is the same smoked material without blur.
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
    val geo = LocalPejvakGeometry.current
    val backdrop = LocalBackdrop.current
    val blur = frostBlur ?: geo.frost.blur
    val canBlur = backdrop != null && Build.VERSION.SDK_INT >= 31
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
    ) {
        // The pane floor sits under the blur, so transparent backdrop regions read as the
        // theme field rather than whatever is behind the window.
        Box(Modifier.matchParentSize().background(tokens.frostBase))
        if (canBlur) {
            BackdropBlur(
                backdrop = backdrop,
                radius = blur,
                modifier = Modifier.matchParentSize(),
            )
        } else {
            Box(Modifier.matchParentSize().background(tokens.frostFallback))
        }
        // Smoke + milk over the blur; their alphas are what let the water show through.
        Box(
            Modifier
                .matchParentSize()
                .background(tokens.frostScrim)
                .background(tokens.frostSheen),
        )
        content()
    }
}

/** The shell's soft dock elevation (DESING.md §6: no hard shadows). */
@Composable
fun dockElevation(): Dp = LocalPejvakGeometry.current.spacing.sm
