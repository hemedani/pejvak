package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * A date range as the Notes/History screens understand it (mirrors
 * mobile/src/lib/dateRange.ts): inclusive millisecond bounds, either side optional.
 */
data class DateRange(
    val from: Long?,
    val to: Long?,
)

val ANY_DATE = DateRange(null, null)

enum class DatePreset { Any, Today, Week, Month, Year, Custom }

fun startOfDay(timestamp: Long, zone: ZoneId = ZoneId.systemDefault()): Long =
    Instant.ofEpochMilli(timestamp).atZone(zone).toLocalDate()
        .atStartOfDay(zone).toInstant().toEpochMilli()

fun endOfDay(timestamp: Long, zone: ZoneId = ZoneId.systemDefault()): Long {
    val date = Instant.ofEpochMilli(timestamp).atZone(zone).toLocalDate()
    return date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
}

fun isRangeActive(range: DateRange): Boolean = range.from != null || range.to != null

/** Inclusive on both ends — a note at 23:59 on the last day still counts. */
fun rangeContains(range: DateRange, timestamp: Long): Boolean {
    if (range.from != null && timestamp < range.from) return false
    if (range.to != null && timestamp > range.to) return false
    return true
}

/**
 * The range a preset stands for. Rolling presets count today as one of their
 * days: "7 days" is today and the six before it.
 */
fun presetRange(
    preset: DatePreset,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
): DateRange {
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return when (preset) {
        DatePreset.Any -> ANY_DATE
        DatePreset.Today -> DateRange(startOfDay(now, zone), endOfDay(now, zone))
        DatePreset.Week -> DateRange(
            today.minusDays(6).atStartOfDay(zone).toInstant().toEpochMilli(),
            endOfDay(now, zone),
        )
        DatePreset.Month -> DateRange(
            today.minusDays(29).atStartOfDay(zone).toInstant().toEpochMilli(),
            endOfDay(now, zone),
        )
        DatePreset.Year -> DateRange(
            today.withDayOfYear(1).atStartOfDay(zone).toInstant().toEpochMilli(),
            endOfDay(now, zone),
        )
        DatePreset.Custom -> ANY_DATE
    }
}

/** Which preset a range looks like, for a control that has to show a state. */
fun presetForRange(
    range: DateRange,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
): DatePreset {
    if (!isRangeActive(range)) return DatePreset.Any
    for (preset in listOf(DatePreset.Today, DatePreset.Week, DatePreset.Month, DatePreset.Year)) {
        val candidate = presetRange(preset, now, zone)
        if (candidate.from == range.from && candidate.to == range.to) return preset
    }
    return DatePreset.Custom
}

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

private fun shortDate(timestamp: Long, now: Long, zone: ZoneId): String {
    val date = Instant.ofEpochMilli(timestamp).atZone(zone)
    val currentYear = Instant.ofEpochMilli(now).atZone(zone).year
    val month = MONTHS[date.monthValue - 1]
    return if (date.year == currentYear) "${date.dayOfMonth} $month"
    else "${date.dayOfMonth} $month ${date.year}"
}

/**
 * The range in words: "Any date", "9 Mar – 14 Mar", "Since 9 Mar", "Until 9 Mar".
 * A single day is named once; the year appears only when it is not the current one.
 */
fun describeDateRange(
    range: DateRange,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    if (!isRangeActive(range)) return "Any date"
    val from = range.from
    val to = range.to
    if (from != null && to != null) {
        if (startOfDay(from, zone) == startOfDay(to, zone)) return shortDate(from, now, zone)
        return "${shortDate(from, now, zone)} – ${shortDate(to, now, zone)}"
    }
    if (from != null) return "Since ${shortDate(from, now, zone)}"
    return "Until ${shortDate(to!!, now, zone)}"
}

/** `2026-03-09` — the form a date field shows. */
fun formatDateInput(timestamp: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val date = Instant.ofEpochMilli(timestamp).atZone(zone).toLocalDate()
    return String.format(locale = Locale.US, "%04d-%02d-%02d", date.year, date.monthValue, date.dayOfMonth)
}
