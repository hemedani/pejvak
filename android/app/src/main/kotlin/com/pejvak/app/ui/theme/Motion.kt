package com.pejvak.app.ui.theme

import android.os.SystemClock
import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.sin

/** In-app motion preference (Settings wires this in Phase 13). */
enum class MotionPreference { System, Full, Reduced }

val LocalMotionPreference = staticCompositionLocalOf { MotionPreference.System }

/**
 * Motion is governed by `useMotionEnabled()` = OS reduced-motion × in-app preference
 * (DESING.md §8). A component that animates must check it and substitute the final
 * value when false — never rely on the platform flag alone.
 */
@Composable
fun useMotionEnabled(): Boolean {
    val preference = LocalMotionPreference.current
    if (preference == MotionPreference.Reduced) return false
    if (preference == MotionPreference.Full) return true
    val context = LocalContext.current
    val scale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    return scale != 0f
}

/** Ocean-current easing: crisp gentle surge followed by a long silky glide to rest. */
val OceanSwellEasing = CubicBezierEasing(0.22f, 1.0f, 0.36f, 1f)

/** Physics springs (damping ratio, stiffness) ported from the RN motion spec. */
object PejvakSpring {
    val bouncy: SpringSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 400f)
    val press: SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 1200f)
    val gentle: SpringSpec<Float> = spring(dampingRatio = 0.86f, stiffness = 210f)
    val sheet: SpringSpec<Float> = spring(dampingRatio = 0.82f, stiffness = 260f)
    val snap: SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 320f)
    val page: SpringSpec<Float> = spring(dampingRatio = 0.92f, stiffness = 340f)
    fun <T> spec(): SpringSpec<T> =
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
}

/** Duration ladder (ms). */
object PejvakDuration {
    const val INSTANT = 120
    const val EXIT = 130
    const val QUICK = 180
    const val BASE = 260
    const val TOGGLE = 120
    const val CROSSFADE = 400
    const val SCREEN = 420
}

/** Entrance stagger: index-derived, arithmetic — never hand-numbered (cap 320 ms). */
fun stagger(index: Int, step: Int = 45, max: Int = 320): Int = minOf(index * step, max)

internal const val OCEAN_CASCADE_WINDOW_MS = 850L
internal const val OCEAN_CASCADE_INITIAL_ITEMS = 10

internal data class OceanEntrancePlan(
    val delayMs: Int,
    val durationMs: Int,
    val startAlpha: Float,
    val riseScale: Float,
    val swayScale: Float,
    val startScale: Float,
)

internal fun planOceanEntrance(
    index: Int,
    staggerEnabled: Boolean,
    elapsedSinceOriginMs: Long,
    baseDurationMs: Int,
    baseStartScale: Float,
): OceanEntrancePlan {
    val safeIndex = index.coerceAtLeast(0)
    val inInitialCascade = staggerEnabled &&
            safeIndex < OCEAN_CASCADE_INITIAL_ITEMS &&
            elapsedSinceOriginMs <= OCEAN_CASCADE_WINDOW_MS
    return if (inInitialCascade) {
        OceanEntrancePlan(
            delayMs = stagger(safeIndex, step = 32, max = 230),
            durationMs = baseDurationMs,
            startAlpha = 0f,
            riseScale = 1f,
            swayScale = 1f,
            startScale = baseStartScale,
        )
    } else {
        OceanEntrancePlan(
            delayMs = 0,
            durationMs = minOf(baseDurationMs, 220),
            startAlpha = 0.35f,
            riseScale = 0.55f,
            swayScale = 0.4f,
            startScale = 1f - (1f - baseStartScale) * 0.45f,
        )
    }
}

internal fun oceanSwayFactor(index: Int): Float = sin(index.coerceAtLeast(0) * 1.1f)

val LocalOceanCascadeOrigin = staticCompositionLocalOf { 0L }

/**
 * Establishes a bounded reveal window for a scrollable list or page so initially visible
 * cards ripple in sequentially with [stagger], while cards composed later during fast
 * scrolling float in immediately with zero stagger delay.
 */
@Composable
fun OceanCascade(
    key: Any? = Unit,
    content: @Composable () -> Unit,
) {
    val origin = remember(key) { SystemClock.uptimeMillis() }
    CompositionLocalProvider(LocalOceanCascadeOrigin provides origin, content = content)
}

/**
 * Subtle, ocean-current list/card entrance modifier.
 *
 * Cards float buoyantly up (`riseDp`) with a faint sinusoidal lateral weave (`swayDp`,
 * evoking a school of fish gliding smoothly into alignment) using layer-only transforms
 * (zero relayout). Respects [useMotionEnabled] by returning `this` immediately when false.
 */
@Composable
fun Modifier.oceanEntrance(
    index: Int = 0,
    staggerEnabled: Boolean = true,
    riseDp: Dp = 14.dp,
    swayDp: Dp = 5.dp,
    startScale: Float = 0.978f,
    durationMs: Int = 340,
    cascadeOriginMs: Long = LocalOceanCascadeOrigin.current,
): Modifier {
    if (!useMotionEnabled()) return this

    val plan = remember(cascadeOriginMs, index, staggerEnabled, durationMs, startScale) {
        val elapsed = if (cascadeOriginMs <= 0L) {
            0L
        } else {
            (SystemClock.uptimeMillis() - cascadeOriginMs).coerceAtLeast(0L)
        }
        planOceanEntrance(
            index = index,
            staggerEnabled = staggerEnabled,
            elapsedSinceOriginMs = elapsed,
            baseDurationMs = durationMs,
            baseStartScale = startScale,
        )
    }

    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        if (plan.delayMs > 0) delay(plan.delayMs.toLong())
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = plan.durationMs, easing = OceanSwellEasing),
        )
    }

    val density = LocalDensity.current
    val lateralFactor = remember(index) { oceanSwayFactor(index) }
    val risePx = with(density) { (riseDp * plan.riseScale).toPx() }
    val swayPx = with(density) { (swayDp * plan.swayScale).toPx() } * lateralFactor

    return this.graphicsLayer {
        val p = progress.value
        val remaining = 1f - p
        alpha = plan.startAlpha + (1f - plan.startAlpha) * (p * 1.25f).coerceIn(0f, 1f)
        translationY = risePx * remaining
        translationX = swayPx * remaining
        val s = plan.startScale + (1f - plan.startScale) * p
        scaleX = s
        scaleY = s
    }
}
