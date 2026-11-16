package com.pejvak.app.domain

val SPEED_CYCLE: List<Double> = listOf(0.75, 1.0, 1.25, 1.5, 2.0)

fun nextSpeed(current: Double): Double {
    val index = SPEED_CYCLE.indexOfFirst { kotlin.math.abs(it - current) < 0.001 }
    if (index < 0) return 1.0
    return SPEED_CYCLE[(index + 1) % SPEED_CYCLE.size]
}

fun formatSpeed(speed: Double): String {
    val rounded = kotlin.math.round(speed * 100) / 100
    return if (rounded == kotlin.math.floor(rounded)) "${rounded.toInt()}\u00d7" else "$rounded\u00d7"
}

fun formatRemaining(positionSec: Int, durationSec: Int): String {
    val remaining = (durationSec - positionSec).coerceAtLeast(0)
    return "\u2212${formatClock(remaining)}"
}

fun formatListened(sec: Int): String {
    val safe = sec.coerceAtLeast(0)
    val minutes = safe / 60
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours > 0 -> "$hours h $rest min"
        minutes > 0 -> "$minutes min"
        else -> "0 min"
    }
}

fun contextPositionLabel(index: Int, count: Int): String? {
    if (count <= 0) return null
    val position = (index + 1).coerceIn(1, count)
    return "$position of $count"
}

fun sleepTimerLabel(remainingSec: Int?): String {
    if (remainingSec == null) return "Sleep"
    if (remainingSec <= 0) return "Sleep"
    val minutes = (remainingSec + 59) / 60
    return "Sleep ${minutes}m"
}

fun digitsToSeconds(digits: String): Int {
    val clean = digits.filter { it.isDigit() }.takeLast(6)
    if (clean.isEmpty()) return 0
    val seconds = clean.takeLast(2).toIntOrNull() ?: 0
    val minutes = clean.dropLast(2).takeLast(2).ifEmpty { "0" }.toIntOrNull() ?: 0
    val hours = clean.dropLast(4).ifEmpty { "0" }.toIntOrNull() ?: 0
    return hours * 3600 + minutes * 60 + seconds
}

fun clampSeconds(value: Int, maxSec: Int): Int = value.coerceIn(0, maxSec.coerceAtLeast(0))
