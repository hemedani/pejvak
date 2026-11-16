package com.pejvak.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Geometry tokens from DESING.md §5. One strictly-increasing radius ramp, a 4 dp
 * spacing rhythm, and semantic aliases — never hard-code a corner or a clearance.
 */
@Immutable
data class Radius(
    val xs: Dp = 8.dp,
    val sm: Dp = 12.dp,
    val md: Dp = 16.dp,
    val lg: Dp = 20.dp,
    val card: Dp = 28.dp,
    val xl: Dp = 32.dp,
    val xxl: Dp = 40.dp,
    val pill: Dp = 999.dp,
) {
    val badge: Dp get() = sm
    val tile: Dp get() = sm
    val segment: Dp get() = lg
    val panel: Dp get() = card
}

@Immutable
data class Spacing(
    val none: Dp = 0.dp,
    val xxs: Dp = 2.dp,
    val xs: Dp = 4.dp,
    val sm: Dp = 8.dp,
    val md: Dp = 12.dp,
    val lg: Dp = 16.dp,
    val xl: Dp = 20.dp,
    val xxl: Dp = 24.dp,
    val xxxl: Dp = 32.dp,
    val huge: Dp = 44.dp,
    val giant: Dp = 64.dp,
)

@Immutable
data class Tiles(val sm: Dp = 32.dp, val md: Dp = 40.dp, val lg: Dp = 48.dp, val xl: Dp = 56.dp, val hero: Dp = 76.dp)

@Immutable
data class Controls(val sm: Dp = 36.dp, val md: Dp = 40.dp, val lg: Dp = 44.dp, val xl: Dp = 52.dp, val play: Dp = 64.dp)

@Immutable
data class Bars(val thin: Dp = 4.dp, val thick: Dp = 6.dp, val seekerTrack: Dp = 2.dp, val seekerThumb: Dp = 12.dp)

@Immutable
data class IconSizes(val xs: Dp = 13.dp, val sm: Dp = 15.dp, val md: Dp = 18.dp, val lg: Dp = 22.dp, val xl: Dp = 26.dp, val hero: Dp = 44.dp)

@Immutable
data class DockGeometry(
    val playerHeight: Dp = 58.dp,
    val navHeight: Dp = 58.dp,
    val indicator: Dp = 40.dp,
    val icon: Dp = 22.dp,
    val iconActive: Dp = 20.dp,
    val touch: Dp = 44.dp,
    val margin: Dp = 10.dp,
    val inset: Dp = 12.dp,
) {
    /** Screens owe the dock this inset (sized for the dock at its tallest), never a literal. */
    val dockInset: Dp get() = playerHeight + navHeight + margin * 2 + inset
}

@Immutable
data class PejvakGeometry(
    val radius: Radius = Radius(),
    val spacing: Spacing = Spacing(),
    val tiles: Tiles = Tiles(),
    val controls: Controls = Controls(),
    val bars: Bars = Bars(),
    val icons: IconSizes = IconSizes(),
    val dock: DockGeometry = DockGeometry(),
    val maxContentWidth: Dp = 760.dp,
)

val LocalPejvakGeometry = staticCompositionLocalOf { PejvakGeometry() }

/** Corner scales with tile size (DESING.md §5). */
fun tileRadius(size: Dp): Dp = when {
    size <= 32.dp -> 8.dp
    size <= 40.dp -> 12.dp
    size <= 48.dp -> 12.dp
    size <= 56.dp -> 16.dp
    else -> 20.dp
}