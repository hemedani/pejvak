package com.pejvak.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.BlurredEdgeTreatment
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect

/**
 * The one heavy-frost material for shell chrome (plan 02 §2). Header, dock and the
 * standalone mini-player use this and nothing else; content cards keep the light
 * [GlassSurface] recipe.
 *
 * Blur alone leaves recognisable moving shapes. The smoked scrim extinguishes the
 * residual detail, the sheen seasons it, and the grain sells the surface. On API
 * 29–30 Haze draws [fallbackColorEffect] instead — the same smoked material without
 * blur, so legibility never depends on blur.
 */
@Composable
fun rememberPejvakFrost(blur: androidx.compose.ui.unit.Dp = LocalPejvakGeometry.current.frost.blur): HazeBlurStyle {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    return remember(tokens, geo.frost, blur) {
        HazeBlurStyle {
            blurRadius(blur)
            backgroundColor(tokens.frostBase)
            colorEffects(
                listOf(
                    HazeColorEffect.tint(tokens.frostScrim),
                    HazeColorEffect.tint(tokens.frostSheen),
                ),
            )
            noiseFactor(geo.frost.noise)
            fallbackColorEffect(HazeColorEffect.tint(tokens.frostFallback))
            blurredEdgeTreatment(BlurredEdgeTreatment.Rectangle)
        }
    }
}
