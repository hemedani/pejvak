package com.pejvak.app.core

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Haptic intents (DESING.md §8). One helper, fired once on press; the master switch
 * lives in Settings and arrives through [LocalHapticsEnabled]. Screens never call
 * the platform haptics API directly.
 */
val LocalHapticsEnabled = staticCompositionLocalOf { true }

enum class HapticIntent { None, Tap, Select, Press, Success, Warning, Error, Scrub }

class Haptics(private val feedback: HapticFeedback, private val enabled: Boolean) {
    fun trigger(intent: HapticIntent) {
        if (!enabled || intent == HapticIntent.None) return
        val type = when (intent) {
            HapticIntent.Tap, HapticIntent.Press, HapticIntent.Success -> HapticFeedbackType.LongPress
            HapticIntent.Select, HapticIntent.Scrub -> HapticFeedbackType.TextHandleMove
            HapticIntent.Warning, HapticIntent.Error -> HapticFeedbackType.LongPress
            HapticIntent.None -> return
        }
        feedback.performHapticFeedback(type)
    }
}

@Composable
fun rememberHaptics(enabled: Boolean = LocalHapticsEnabled.current): Haptics {
    val feedback = LocalHapticFeedback.current
    return remember(feedback, enabled) { Haptics(feedback, enabled) }
}