package com.pejvak.app.ui.theme

import android.provider.Settings
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

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

/** Physics springs (damping ratio, stiffness) ported from the RN motion spec. */
object PejvakSpring {
    val bouncy: SpringSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 400f)
    val press: SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 1200f)
    val gentle: SpringSpec<Float> = spring(dampingRatio = 0.86f, stiffness = 210f)
    val sheet: SpringSpec<Float> = spring(dampingRatio = 0.82f, stiffness = 260f)
    val snap: SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 320f)
    val page: SpringSpec<Float> = spring(dampingRatio = 0.92f, stiffness = 340f)
    fun <T> spec(): SpringSpec<T> = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
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