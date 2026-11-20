package com.pejvak.app.domain

import java.util.Locale
import kotlin.math.abs
import kotlin.math.round

/**
 * The conditions a session was heard under: whether it belonged to a collection,
 * how that collection was ordered, and how the audio was shaped. Captured once at
 * session start; every field is optional on the wire and in Room, and the defaults
 * below are applied on read by [normalizePlaybackConditions] so the UI never has to
 * special-case a legacy row.
 */

enum class CollectionSort(val wire: String, val label: String) {
    Unknown("unknown", "Unknown"),
    Manual("manual", "Manual"),
    Name("name", "Name"),
    CreatedAt("createdAt", "Created"),
    Duration("duration", "Duration"),
    Folder("folder", "Folder"),
    Smart("smart", "Smart"),
    Source("source", "Source"),
    Shuffle("shuffle", "Shuffle"),
    ;

    companion object {
        fun from(wire: String?): CollectionSort? = entries.firstOrNull { it.wire == wire }
    }
}

enum class SortDirection(val wire: String, val label: String) {
    Asc("asc", "Ascending"),
    Desc("desc", "Descending"),
    ;

    companion object {
        fun from(wire: String?): SortDirection? = entries.firstOrNull { it.wire == wire }
    }
}

/** Standalone is derived from `contextType == null`; it is never stored twice. */
enum class CollectionKind { Standalone, Collection }

data class PlaybackConditions(
    val contextTitle: String? = null,
    val collectionSort: CollectionSort = CollectionSort.Unknown,
    val collectionSortDirection: SortDirection = SortDirection.Asc,
    val collectionIndex: Int = 0,
    val collectionSize: Int = 0,
    val ambientTone: String = DEFAULT_AMBIENT_TONE,
    val ambientLevel: Int = 0,
    val volumePercent: Int = 100,
    val enhancerEnabled: Boolean = false,
    val enhancerBoostDb: Double = 0.0,
    val enhancerBassDb: Double = 0.0,
    val enhancerTrebleDb: Double = 0.0,
)

const val DEFAULT_AMBIENT_TONE: String = "none"
const val DEFAULT_VOLUME_PERCENT: Int = 100

/**
 * Level 0 is the off switch, not a silent version of the last tone: the picker
 * keeps the selected tone id when the listener drags the level to zero, so that
 * id must never be captured as an active ambience.
 */
fun capturedAmbientTone(toneId: String?, level: Int): String =
    if (level <= 0) {
        DEFAULT_AMBIENT_TONE
    } else {
        toneId?.takeIf { it.isNotBlank() } ?: DEFAULT_AMBIENT_TONE
    }

/** The single place every nullable session field becomes a usable snapshot. */
fun normalizePlaybackConditions(
    contextTitle: String? = null,
    collectionSort: CollectionSort? = null,
    collectionSortDirection: SortDirection? = null,
    collectionIndex: Int? = null,
    collectionSize: Int? = null,
    ambientTone: String? = null,
    ambientLevel: Int? = null,
    volumePercent: Int? = null,
    enhancerEnabled: Boolean? = null,
    enhancerBoostDb: Double? = null,
    enhancerBassDb: Double? = null,
    enhancerTrebleDb: Double? = null,
): PlaybackConditions {
    val level = (ambientLevel ?: 0).coerceIn(0, 100)
    return PlaybackConditions(
        contextTitle = contextTitle,
        collectionSort = collectionSort ?: CollectionSort.Unknown,
        collectionSortDirection = collectionSortDirection ?: SortDirection.Asc,
        collectionIndex = (collectionIndex ?: 0).coerceAtLeast(0),
        collectionSize = (collectionSize ?: 0).coerceAtLeast(0),
        ambientTone = capturedAmbientTone(ambientTone, level),
        ambientLevel = level,
        volumePercent = (volumePercent ?: DEFAULT_VOLUME_PERCENT).coerceIn(0, 100),
        enhancerEnabled = enhancerEnabled ?: false,
        enhancerBoostDb = enhancerBoostDb.finiteOrZero(),
        enhancerBassDb = enhancerBassDb.finiteOrZero(),
        enhancerTrebleDb = enhancerTrebleDb.finiteOrZero(),
    )
}

private fun Double?.finiteOrZero(): Double = if (this != null && isFinite()) this else 0.0

/** A stored snapshot made safe to apply as the next item's starting conditions. */
fun PlaybackConditions.forInheritance(): PlaybackConditions = normalizePlaybackConditions(
    contextTitle = contextTitle,
    collectionSort = collectionSort,
    collectionSortDirection = collectionSortDirection,
    collectionIndex = collectionIndex,
    collectionSize = collectionSize,
    ambientTone = ambientTone,
    ambientLevel = ambientLevel,
    volumePercent = volumePercent,
    enhancerEnabled = enhancerEnabled,
    enhancerBoostDb = enhancerBoostDb,
    enhancerBassDb = enhancerBassDb,
    enhancerTrebleDb = enhancerTrebleDb,
)

/** Read a session's stored snapshot with every legacy gap filled in. */
fun Session.playbackConditions(): PlaybackConditions = normalizePlaybackConditions(
    contextTitle = contextTitle,
    collectionSort = collectionSort,
    collectionSortDirection = collectionSortDirection,
    collectionIndex = collectionIndex,
    collectionSize = collectionSize,
    ambientTone = ambientTone,
    ambientLevel = ambientLevel,
    volumePercent = volumePercent,
    enhancerEnabled = enhancerEnabled,
    enhancerBoostDb = enhancerBoostDb,
    enhancerBassDb = enhancerBassDb,
    enhancerTrebleDb = enhancerTrebleDb,
)

fun HistoryItem.collectionKind(): CollectionKind =
    if (session.contextType == null) CollectionKind.Standalone else CollectionKind.Collection

fun playbackOrderValue(
    conditions: PlaybackConditions,
    includeDirection: Boolean = true,
): String? {
    if (conditions.collectionSort == CollectionSort.Unknown) return null
    val position = formatContextPosition(conditions.collectionIndex, conditions.collectionSize)
    return listOfNotNull(
        conditions.collectionSort.label,
        if (includeDirection) conditions.collectionSortDirection.label else null,
        position.ifBlank { null },
    ).joinToString(if (includeDirection) " \u00b7 " else ", ")
}

fun playbackAmbienceValue(conditions: PlaybackConditions): String? =
    ambienceDescription(conditions.ambientTone, conditions.ambientLevel)

fun playbackVolumeValue(conditions: PlaybackConditions): String = "${conditions.volumePercent}%"

fun playbackEnhancerValue(conditions: PlaybackConditions): String? {
    val boost = conditions.enhancerBoostDb
    val bass = conditions.enhancerBassDb
    val treble = conditions.enhancerTrebleDb
    val flat = boost == 0.0 && bass == 0.0 && treble == 0.0
    if (!conditions.enhancerEnabled && flat) return null
    val bands = buildList {
        if (boost != 0.0) add(formatGainDb(boost))
        if (bass != 0.0) add("bass ${formatGainDb(bass)}")
        if (treble != 0.0) add("treble ${formatGainDb(treble)}")
    }
    return if (bands.isEmpty()) "on" else bands.joinToString(", ")
}

/** The facts a history detail card shows, in order. Empty pieces are omitted. */
fun describePlaybackConditions(
    conditions: PlaybackConditions,
    includeDirection: Boolean = false,
): List<String> = buildList {
    playbackOrderValue(conditions, includeDirection)?.let(::add)
    playbackAmbienceValue(conditions)?.let(::add)
    add("Volume ${playbackVolumeValue(conditions)}")
    playbackEnhancerValue(conditions)?.let { add("Enhancer $it") }
}

/** A compact markdown fragment appended to a history export line. */
fun playbackMarkdownContext(conditions: PlaybackConditions): String {
    val title = conditions.contextTitle?.takeIf { it.isNotBlank() }
    return (listOfNotNull(title) + describePlaybackConditions(conditions)).joinToString(" \u00b7 ")
}

private fun ambienceDescription(tone: String, level: Int): String? {
    if (level <= 0) return null
    val id = tone.trim()
    val hasTone = id.isNotEmpty() && !id.equals(DEFAULT_AMBIENT_TONE, ignoreCase = true)
    val label = if (!hasTone) null else findTone(id)?.label ?: id.replaceFirstChar { it.uppercase() }
    return if (label != null) "$label, level $level" else "Level $level"
}

private fun formatGainDb(value: Double): String {
    val rounded = round(value * 10) / 10
    val magnitude = if (rounded == rounded.toInt().toDouble()) {
        abs(rounded).toInt().toString()
    } else {
        String.format(Locale.US, "%.1f", abs(rounded))
    }
    val sign = if (rounded < 0) "\u2212" else "+"
    return "$sign$magnitude dB"
}
