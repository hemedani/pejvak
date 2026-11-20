package com.pejvak.app.ui.components

import android.graphics.Bitmap
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** Clearance the floating dock occupies, measured in the shell (not a literal). */
data class ShellInsets(val bottom: Dp = 0.dp)

val LocalShellInsets = staticCompositionLocalOf { ShellInsets() }

/**
 * A crystalline frosted shell pane. The pane samples the live [Backdrop] through a
 * downscaled [BackdropBlur] (hardware RenderEffect blur + vibrancy on API 31+), layers
 * luminous frost tint + subtle micro-grain + curved inner specular catchlight, and
 * finishes with a contour-following bevel border. The pane's own children stay crisp.
 *
 * Outside a backdrop or on API 29–30 (no RenderEffect), the pane draws `frostFallback`.
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
    val grainBrush = rememberFrostGrainBrush(noise = geo.frost.noise)
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
            .background(tokens.frostBase),
    ) {
        if (canBlur) {
            BackdropBlur(
                backdrop = backdrop,
                radius = blur,
                modifier = Modifier.matchParentSize(),
            )
        } else {
            Box(Modifier.matchParentSize().background(tokens.frostFallback))
        }
        // Luminous tint + crystalline frost grain + soft curved inner top catchlight.
        Box(
            Modifier
                .matchParentSize()
                .background(tokens.frostScrim)
                .background(tokens.frostSheen)
                .background(grainBrush)
                .drawBehind {
                    val sheenHeight = (size.height * 0.30f).coerceAtMost(28.dp.toPx())
                    if (sheenHeight > 0f) {
                        drawRect(
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    Color.White.copy(alpha = if (tokens.isDark) 0.08f else 0.14f),
                                    Color.Transparent,
                                ),
                                startY = 0f,
                                endY = sheenHeight,
                            ),
                            size = Size(size.width, sheenHeight),
                        )
                    }
                },
        )
        content()
        // Contour-following directional glass edge so rounded corners catch light cleanly.
        Box(
            Modifier
                .matchParentSize()
                .border(
                    width = borderWidth,
                    brush = Brush.verticalGradient(
                        0f to tokens.glassHighlight,
                        0.32f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.58f),
                        0.75f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.24f),
                        1f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.62f),
                    ),
                    shape = shape,
                ),
        )
    }
}

@Composable
private fun rememberFrostGrainBrush(noise: Float): ShaderBrush {
    return remember(noise) {
        val size = 64
        val maxAlpha = (noise * 0.36f * 255f).toInt().coerceIn(0, 28)
        val pixels = IntArray(size * size)
        for (y in 0 until size) {
            for (x in 0 until size) {
                var h = (x * 374761393) xor (y * 668265263)
                h = (h xor (h ushr 13)) * 1274126177
                val v = (h ushr 24) and 0xFF
                val a = ((v * maxAlpha) / 255) and 0xFF
                val lum = if ((v and 1) == 0) 255 else 210
                pixels[y * size + x] = (a shl 24) or (lum shl 16) or (lum shl 8) or lum
            }
        }
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply {
            setPixels(pixels, 0, size, 0, 0, size, size)
        }
        ShaderBrush(
            ImageShader(
                image = bitmap.asImageBitmap(),
                tileModeX = TileMode.Repeated,
                tileModeY = TileMode.Repeated,
            ),
        )
    }
}

/** The shell's soft dock elevation (DESING.md §6: no hard shadows). */
@Composable
fun dockElevation(): Dp = LocalPejvakGeometry.current.spacing.sm
