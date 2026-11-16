package com.pejvak.app.domain

/**
 * Decides what a discovered file should be called and how it should be filed
 * (mirrors mobile/src/lib/importMetadata.ts). Tags are authoritative when they
 * exist, but a filename frequently carries a track number the tag does not —
 * each field is taken from whichever source actually has it. Pure.
 */

data class ResolvedTrackMetadata(
    val title: String,
    val author: String?,
    val album: String?,
    val trackNumber: Int?,
    val discNumber: Int?,
    val year: Int?,
    val isAudiobook: Boolean,
)

/** Past this length, treating a file as long-form rather than music is a safe bet. */
private const val AUDIOBOOK_MIN_SEC = 30 * 60

fun resolveTrackMetadata(fileName: String, durationSec: Int, tags: AudioTags): ResolvedTrackMetadata {
    val fromName = readFilenameTags(fileName)
    val fallbackTitle = stripExtension(fileName).trim().ifEmpty { fileName }

    return ResolvedTrackMetadata(
        title = tags.title ?: fromName.title ?: fallbackTitle,
        author = tags.artist,
        album = tags.album,
        trackNumber = tags.trackNumber ?: fromName.trackNumber,
        discNumber = tags.discNumber,
        year = tags.year ?: fromName.year,
        // .m4b is the audiobook container specifically; length covers the rest,
        // including the folder-scan case where the duration is not yet known.
        isAudiobook = fileExtension(fileName) == "m4b" || durationSec >= AUDIOBOOK_MIN_SEC,
    )
}