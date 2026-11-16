package com.pejvak.app.domain

/**
 * Classifies what a device scan found, before a single byte is written (mirrors
 * mobile/src/lib/scanPlan.ts). Phase 1 is pure bookkeeping: compare the media
 * index against the library and decide, per file, whether anything needs to
 * happen. Phase 2 reads bytes only for the candidates this plan marks. Pure.
 */

data class DiscoveredFile(
    /** Stable identifier: a MediaStore asset id or a SAF document URI. */
    val sourceId: String,
    /** The URI handed to the player. */
    val uri: String,
    /** Filesystem path when known; drives folder derivation. */
    val path: String?,
    val fileName: String,
    /** Null when the source does not report a size — the media index does not. */
    val sizeBytes: Long?,
    val modifiedAt: Long?,
    /** From the media index; 0 when the source does not report a duration. */
    val durationSec: Int,
    /** "mediastore" or "saf". */
    val source: String,
    val folderKey: String?,
    val folderName: String?,
)

enum class ScanStatus(val wire: String) {
    /** Not in the library; needs identifying and importing. */
    New("new"),
    /** Already imported from this exact location, unchanged; nothing to do. */
    Known("known"),
    /** Already imported from this location but the file differs; re-identify. */
    Changed("changed"),
    /** A different location holding content we already have (or a scan sibling). */
    Duplicate("duplicate"),
    /** A library track whose file is gone — the same content moved; re-point it. */
    Relink("relink"),
}

data class ScanCandidate(
    val file: DiscoveredFile,
    val status: ScanStatus,
    /** For duplicate/relink: a content hash or a sibling sourceId. */
    val duplicateOf: String?,
)

data class ScanSummary(
    val total: Int = 0,
    val new: Int = 0,
    val known: Int = 0,
    val changed: Int = 0,
    val duplicate: Int = 0,
    val relink: Int = 0,
    /** How many files phase 2 will have to open — the cost the plan exists to reduce. */
    val identifyCount: Int = 0,
)

data class ScanPlan(val candidates: List<ScanCandidate>, val summary: ScanSummary)

/** The slice of a library track the planner needs. */
data class LibraryEntry(
    val contentHash: String,
    val sourceUri: String?,
    val sourceSize: Long?,
    val sourceMtime: Long?,
    val title: String,
    val durationSec: Int,
    val availability: Availability,
)

/**
 * Folds a title to a comparison key: case, accents, punctuation, a leading track
 * number and the file extension all stop mattering.
 */
fun normaliseTitle(value: String): String {
    val decomposed = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
    return decomposed
        .replace(Regex("[\\u0300-\\u036f]"), "")
        .lowercase()
        .replace(Regex("\\.[a-z0-9]{1,5}$"), "")
        .replace(Regex("^\\s*\\d{1,3}\\s*[-–—_.)\\]]\\s*"), "")
        .replace(Regex("[^a-z0-9]+"), "")
}

/** Duration agreement within 1% (at least 2 s), which absorbs re-encode padding. */
private fun durationsAgree(leftSec: Int, rightSec: Int): Boolean {
    if (leftSec <= 0 || rightSec <= 0) return false
    val tolerance = maxOf(2, Math.round(maxOf(leftSec, rightSec) * 0.01).toInt())
    return kotlin.math.abs(leftSec - rightSec) <= tolerance
}

/**
 * Same title and same length — a re-encode or a second copy. Both durations must
 * be known and agree; a title alone is far too weak to hide a file behind.
 */
fun isNearDuplicate(leftTitle: String, leftDurationSec: Int, rightTitle: String, rightDurationSec: Int): Boolean {
    val left = normaliseTitle(leftTitle)
    val right = normaliseTitle(rightTitle)
    if (left.isEmpty() || left != right) return false
    return durationsAgree(leftDurationSec, rightDurationSec)
}

/** Case-insensitive filename equality. */
fun isSameFileName(left: String, right: String): Boolean =
    left.trim().lowercase() == right.trim().lowercase()

/**
 * Whether a candidate must have its bytes read before anything can be decided.
 * One predicate sizes the phase-2 cost AND selects the files opened, so the
 * preview can never disagree with the work. Relink is included: only the hash
 * settles a title+duration match.
 */
fun needsIdentification(status: ScanStatus): Boolean =
    status == ScanStatus.New || status == ScanStatus.Changed || status == ScanStatus.Relink

/**
 * Whether a library row's own file is known to be gone: availability when
 * something already wrote it, or a caller-verified goneLocations entry.
 */
private fun isLocationGone(entry: LibraryEntry, goneLocations: Set<String>): Boolean =
    entry.availability == Availability.Missing ||
        (entry.sourceUri != null && entry.sourceUri in goneLocations)

/**
 * The library rows whose recorded location is worth checking, given what the
 * scan found. Narrowed deliberately: only rows whose title a discovered file
 * could match are ever relink candidates. Rows already flagged missing and rows
 * with no URI are left out. Pure, so the caller can size the work first.
 */
fun libraryEntriesToVerify(files: List<DiscoveredFile>, library: List<LibraryEntry>): List<LibraryEntry> {
    val discoveredTitles = files.map { normaliseTitle(it.fileName) }.filter { it.isNotEmpty() }.toSet()
    val seenUris = mutableSetOf<String>()
    val result = mutableListOf<LibraryEntry>()
    for (entry in library) {
        val uri = entry.sourceUri
        if (uri.isNullOrEmpty() || entry.availability == Availability.Missing || uri in seenUris) continue
        val key = normaliseTitle(entry.title)
        if (key.isEmpty() || key !in discoveredTitles) continue
        seenUris.add(uri)
        result.add(entry)
    }
    return result
}

/**
 * Normalises a source timestamp to milliseconds. The two scan sources disagree
 * (seconds vs millis); left unnormalised an untouched file would look "changed"
 * on every rescan through the other source. 1e11 ms is 1973 — below is seconds.
 */
fun toEpochMillis(value: Long?): Long? {
    if (value == null || value <= 0) return null
    return if (value < 100_000_000_000L) value * 1000 else value
}

private fun compareCandidates(left: ScanCandidate, right: ScanCandidate): Int {
    val leftFolder = left.file.folderKey ?: ""
    val rightFolder = right.file.folderKey ?: ""
    if (leftFolder != rightFolder) return naturalCompare(leftFolder, rightFolder)
    return naturalCompare(left.file.fileName, right.file.fileName)
}

/**
 * Builds the plan. Files may arrive in any order and may repeat across
 * overlapping sources; the sibling pass collapses them. goneLocations holds
 * URIs the caller found unreachable — a scan that passes nothing cannot tell a
 * moved file from a duplicate, and says so by classifying both as duplicate.
 */
fun buildScanPlan(
    files: List<DiscoveredFile>,
    library: List<LibraryEntry>,
    goneLocations: Set<String> = emptySet(),
): ScanPlan {
    val bySourceUri = mutableMapOf<String, LibraryEntry>()
    val libraryByTitle = mutableMapOf<String, MutableList<LibraryEntry>>()

    for (entry in library) {
        entry.sourceUri?.let { bySourceUri[it] = entry }
        val key = normaliseTitle(entry.title)
        if (key.isNotEmpty()) libraryByTitle.getOrPut(key) { mutableListOf() }.add(entry)
    }

    // Candidates seen so far in this scan, keyed by title, so a file reachable
    // through two sources is only imported once.
    val seenInScan = mutableMapOf<String, ScanCandidate>()
    val candidates = mutableListOf<ScanCandidate>()

    for (file in files) {
        val existing = bySourceUri[file.uri]
        val titleKey = normaliseTitle(file.fileName)

        val status: ScanStatus
        var duplicateOf: String? = null

        if (existing != null) {
            // mtime is the primary rescan key (the only signal the media index
            // reports); size corroborates when both sides know it.
            val mtimeMatches = existing.sourceMtime != null && file.modifiedAt != null &&
                existing.sourceMtime == file.modifiedAt
            val sizeMatches = existing.sourceSize == null || file.sizeBytes == null ||
                existing.sourceSize == file.sizeBytes
            status = if (mtimeMatches && sizeMatches) ScanStatus.Known else ScanStatus.Changed
        } else {
            val sibling = if (titleKey.isNotEmpty()) seenInScan[titleKey] else null
            // Within one scan, the same filename twice is a double-discovery.
            val siblingMatch = sibling?.takeIf {
                isSameFileName(it.file.fileName, file.fileName) ||
                    isNearDuplicate(it.file.fileName, it.file.durationSec, file.fileName, file.durationSec)
            }

            // A near-duplicate whose file is gone is preferred: relinking it is
            // the only outcome that restores history.
            val nearDuplicates = (if (titleKey.isNotEmpty()) libraryByTitle[titleKey] else null)
                ?.filter { isNearDuplicate(it.title, it.durationSec, file.fileName, file.durationSec) }
                ?: emptyList()
            val libraryMatch = nearDuplicates.firstOrNull { isLocationGone(it, goneLocations) }
                ?: nearDuplicates.firstOrNull()

            when {
                siblingMatch != null -> {
                    status = ScanStatus.Duplicate
                    duplicateOf = siblingMatch.file.sourceId
                }
                libraryMatch != null -> {
                    status = if (isLocationGone(libraryMatch, goneLocations)) ScanStatus.Relink else ScanStatus.Duplicate
                    duplicateOf = libraryMatch.contentHash
                }
                else -> status = ScanStatus.New
            }
        }

        val candidate = ScanCandidate(file, status, duplicateOf)
        candidates.add(candidate)
        if (status != ScanStatus.Duplicate && titleKey.isNotEmpty() && titleKey !in seenInScan) {
            seenInScan[titleKey] = candidate
        }
    }

    candidates.sortWith(::compareCandidates)

    var summary = ScanSummary(total = candidates.size)
    for (candidate in candidates) {
        summary = when (candidate.status) {
            ScanStatus.New -> summary.copy(new = summary.new + 1)
            ScanStatus.Known -> summary.copy(known = summary.known + 1)
            ScanStatus.Changed -> summary.copy(changed = summary.changed + 1)
            ScanStatus.Duplicate -> summary.copy(duplicate = summary.duplicate + 1)
            ScanStatus.Relink -> summary.copy(relink = summary.relink + 1)
        }
        if (needsIdentification(candidate.status)) summary = summary.copy(identifyCount = summary.identifyCount + 1)
    }

    return ScanPlan(candidates, summary)
}