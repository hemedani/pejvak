package com.pejvak.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Pejvak glass palette — the contract from DESING.md §3. ALL colors live in the
 * theme; no color literal outside `ui/theme/`. The full token system (spacing,
 * radius ramp, aurora ramps, type scale) is formalized in Phase 1; these are the
 * surface/text/accent anchors the shell renders with today.
 */

// --- Canvas (the field behind the glass; never near-white in light) ---
// Deep mid-tone so white-on-glass clears 4.5:1 against the worst-case bloom
// (pinned by ContrastContractTest). Light is a brighter field than dark, not white.
val CanvasBaseLight = Color(0xFF33505F)
val CanvasBaseDark = Color(0xFF0A0F16)

// --- Glass fills ---
val GlassFillLight = Color(0x29FFFFFF)        // white 16%
val GlassFillDark = Color(0x14FFFFFF)         // white 8%
val GlassFillStrongLight = Color(0x42FFFFFF)  // white 26%
val GlassFillStrongDark = Color(0x24FFFFFF)   // white 14%
val GlassFillFallbackLight = Color(0x4DFFFFFF)// white 30% (API 29-30)
val GlassFillFallbackDark = Color(0xB8141C26) // dark 72% (API 29-30)

// --- Frost material (shell chrome only: header, dock, mini-player) ---
// The smoked tint is what makes content behind a pane read as colour washes rather
// than recognisable shapes; the sheen seasons it. Percentages are of the pane's own
// alpha, so the alpha-scaling rule applies when composed.
val FrostBaseLight = Color(0x8C33505F)        // canvasBase 55%
val FrostBaseDark = Color(0x9E0A0F16)         // canvasBase 62%
val FrostScrimLight = Color(0x9E33505F)       // canvasBase 62%
val FrostScrimDark = Color(0xAD06090F)        // #06090F 68%
val FrostSheenLight = Color(0x1AFFFFFF)       // white 10%
val FrostSheenDark = Color(0x0FFFFFFF)        // white 6%
val FrostFallbackLight = Color(0xD133505F)    // canvasBase 82% (API 29-30)
val FrostFallbackDark = Color(0xDB06090F)     // #06090F 86% (API 29-30)

// --- Glass edges ---
val GlassBorderLight = Color(0x8CFFFFFF)      // white 55%
val GlassBorderDark = Color(0x38FFFFFF)       // white 22%
val GlassHighlightLight = Color(0xBFFFFFFF)   // white 75%
val GlassHighlightDark = Color(0x59FFFFFF)    // white 35%

// --- Text on glass ---
val TextLight = Color(0xFFFFFFFF)
val TextDark = Color(0xFFF2F6F7)
val TextSecondaryLight = Color(0xBDFFFFFF)    // white 74%
val TextSecondaryDark = Color(0xB8F0F5F6)     // 72%
val TextTertiaryLight = Color(0x85FFFFFF)     // white 52%
val TextTertiaryDark = Color(0x80F0F5F6)      // 50%

// --- Accent & semantic ---
val Accent = Color(0xFFFFFFFF)
val OnAccent = Color(0xFF0E1720)
val AccentTealLight = Color(0xFF0A635C)
val AccentTealDark = Color(0xFF5FD9C6)
val DangerLight = Color(0xFFFFD7DD)
val DangerDark = Color(0xFFFF8296)

// --- Aurora ramps (content identity) [deep, mid, light] ---
val RampTeal = Triple(Color(0xFF0A635C), Color(0xFF159A8C), Color(0xFF5FD9C6))
val RampBlue = Triple(Color(0xFF123A6B), Color(0xFF2D6CB5), Color(0xFF7FB6F0))
val RampPurple = Triple(Color(0xFF3A2A6B), Color(0xFF6C4FC1), Color(0xFFB79CF0))
val RampCoral = Triple(Color(0xFF7A2E3A), Color(0xFFC75B6B), Color(0xFFFF9FAE))
val RampAmber = Triple(Color(0xFF7A4A12), Color(0xFFC78A2D), Color(0xFFFFD08A))
val RampGreen = Triple(Color(0xFF1E5A34), Color(0xFF3E9A5F), Color(0xFF8FD9A8))
val RampPink = Triple(Color(0xFF6B2A5A), Color(0xFFB54F9A), Color(0xFFF09FD9))
val RampCyan = Triple(Color(0xFF0E4A5A), Color(0xFF2D8FA8), Color(0xFF7FD9E8))

val AuroraRamps = listOf(
    RampTeal, RampBlue, RampPurple, RampCoral,
    RampAmber, RampGreen, RampPink, RampCyan,
)