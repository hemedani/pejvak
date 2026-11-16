package com.pejvak.app.domain

/**
 * Per-track colour identity (mirrors mobile/src/lib/palette.ts). A stable palette
 * derived from the contentHash (falling back to title, then id) so the same track
 * paints the same gradient on every device, offline. The domain returns a ramp
 * *index*; the UI maps it to its aurora colors. Pure.
 */
const val AURORA_COUNT: Int = 8

/** FNV-1a 32-bit, returned as the unsigned value (matches JS `hash >>> 0`). */
fun hashString(value: String): Long {
    var hash = 0x811c9dc5.toInt()
    for (ch in value) {
        hash = hash xor ch.code
        hash *= 0x01000193
    }
    return hash.toUInt().toLong()
}

data class TrackSeed(val contentHash: String? = null, val title: String? = null, val id: String? = null)

private fun seedKey(seed: TrackSeed?): String =
    (seed?.contentHash ?: seed?.title ?: seed?.id ?: "").ifEmpty { "pejvak" }

fun paletteIndexFor(seed: TrackSeed?): Int =
    Integer.remainderUnsigned(hashString(seedKey(seed)).toInt(), AURORA_COUNT)

fun paletteIndexFor(key: String): Int =
    Integer.remainderUnsigned(hashString(key.ifEmpty { "pejvak" }).toInt(), AURORA_COUNT)