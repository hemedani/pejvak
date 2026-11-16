package com.pejvak.app.domain

/**
 * The annotation palette (mirrors mobile/src/lib/annotations.ts). Six fixed colors,
 * cycled by index so adjacent notes stay visually distinct on the scrubber. Pure.
 */
val ANNOTATION_COLORS: List<String> = listOf(
    "#208AEF",
    "#E5484D",
    "#30A46C",
    "#F5A623",
    "#8E4EC6",
    "#12A594",
)

val ANNOTATION_COLOR_NAMES: Map<String, String> = mapOf(
    "#208AEF" to "Blue",
    "#E5484D" to "Red",
    "#30A46C" to "Green",
    "#F5A623" to "Amber",
    "#8E4EC6" to "Purple",
    "#12A594" to "Teal",
)

/** Fraction (0–1) of the track at which an annotation marker sits. */
fun markerOffsetRatio(positionSec: Int, durationSec: Int): Float {
    if (durationSec <= 0) return 0f
    return (positionSec.toFloat() / durationSec).coerceIn(0f, 1f)
}

/** Deterministic palette pick that wraps and tolerates negative indexes. */
fun pickAnnotationColor(index: Int): String {
    val size = ANNOTATION_COLORS.size
    val normalized = ((index % size) + size) % size
    return ANNOTATION_COLORS[normalized]
}
