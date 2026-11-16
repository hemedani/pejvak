package com.pejvak.app.domain

/**
 * Recovers metadata from a filename (mirrors mobile/src/lib/filenameTags.ts).
 * Lecture recordings and voice memos rarely carry ID3 tags but are usually named
 * `03 - Thermodynamics.mp3` or `2024-03-12 Lecture 4.mp3`. Pure.
 */

data class FilenameTags(
    val title: String?,
    val trackNumber: Int?,
    val year: Int?,
)

private val DATE_PREFIX = Regex("^(\\d{4})[-_.](\\d{1,2})[-_.](\\d{1,2})\\s*[-_.]?\\s*(.*)$")
private val COMPACT_DATE_PREFIX = Regex("^(\\d{4})(\\d{2})(\\d{2})\\s*[-_.]?\\s*(.*)$")
private val LEADING_NUMBER = Regex("^(\\d{1,3})[\\s\\-–—_.]+(.+)$")
private val TRAILING_NUMBER = Regex("^(.+?)\\s*[-–—_.]\\s*(\\d{1,3})$")

fun stripExtension(fileName: String): String {
    val dot = fileName.lastIndexOf('.')
    // A leading dot is part of the name, not an extension separator.
    return if (dot > 0) fileName.substring(0, dot) else fileName
}

private fun cleanTitle(value: String): String? {
    val cleaned = value.replace(Regex("_+"), " ").replace(Regex("\\s{2,}"), " ").trim()
    return cleaned.ifEmpty { null }
}

private fun validMonthDay(month: String, day: String): Boolean {
    val m = month.toIntOrNull() ?: return false
    val d = day.toIntOrNull() ?: return false
    return m in 1..12 && d in 1..31
}

/**
 * A leading number is only a track number if what follows is not itself numeric —
 * otherwise `1984 Part One` reads as track 198 of "4 Part One".
 */
private fun leadingTrackNumber(value: String): Pair<Int, String>? {
    val match = LEADING_NUMBER.find(value) ?: return null
    val rest = match.groupValues[2].trim()
    if (rest.isEmpty() || rest[0].isDigit()) return null
    return (match.groupValues[1].toIntOrNull() ?: return null) to rest
}

fun readFilenameTags(fileName: String): FilenameTags {
    val stem = stripExtension(fileName).trim()
    if (stem.isEmpty()) return FilenameTags(null, null, null)

    val dated = DATE_PREFIX.find(stem) ?: COMPACT_DATE_PREFIX.find(stem)
    if (dated != null && validMonthDay(dated.groupValues[2], dated.groupValues[3])) {
        val year = dated.groupValues[1].toIntOrNull()
        val rest = dated.groupValues[4]
        // `2024-03-12.mp3` keeps the date as the title rather than becoming untitled.
        val title = cleanTitle(rest) ?: stem
        val numbered = leadingTrackNumber(title)
        return FilenameTags(
            title = if (numbered != null) cleanTitle(numbered.second) else title,
            trackNumber = numbered?.first,
            year = year,
        )
    }

    val leading = leadingTrackNumber(stem)
    if (leading != null) {
        return FilenameTags(cleanTitle(leading.second), leading.first, null)
    }

    val trailing = TRAILING_NUMBER.find(stem)
    if (trailing != null) {
        val title = cleanTitle(trailing.groupValues[1])
        if (title != null) {
            return FilenameTags(title, trailing.groupValues[2].toIntOrNull(), null)
        }
    }

    return FilenameTags(cleanTitle(stem), null, null)
}