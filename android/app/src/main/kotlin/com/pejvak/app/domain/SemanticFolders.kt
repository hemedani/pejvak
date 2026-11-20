package com.pejvak.app.domain

import java.util.Locale

/** A folder that is treated as one lecture/episode collection. */
data class CollectionFolder(val key: String, val name: String, val tracks: List<Track>)

/**
 * Container names that hold stray files rather than a lecture. Compared after
 * normalisation (case, surrounding and repeated whitespace) and only against the
 * folder's own last path segment, so a lecture inside "Downloads" still counts.
 */
val GENERIC_FOLDER_NAMES: Set<String> = setOf(
    "download",
    "downloads",
    "music",
    "podcasts",
    "audio",
    "recordings",
    "telegram",
    "whatsapp",
    "ringtones",
    "alarms",
    "notifications",
    "دانلود",
    "موسیقی",
    "پادکست",
    "صدا",
    "ضبط",
)

fun normalizeFolderName(name: String?): String =
    name
        ?.trim()
        ?.replace(Regex("\\s+"), " ")
        ?.lowercase(Locale.ROOT)
        .orEmpty()

fun isGenericFolderName(name: String?): Boolean =
    normalizeFolderName(name) in GENERIC_FOLDER_NAMES

/** Tracks that can actually be played from this folder. */
fun playableFolderTracks(tracks: List<Track>): List<Track> =
    tracks.filter { it.origin == Origin.Local && it.availability != Availability.Missing }

/**
 * A named folder holding at least two playable local tracks is a collection.
 * The storage root and generic containers never are.
 */
fun isSemanticFolder(folderKey: String?, folderName: String?, playable: List<Track>): Boolean {
    if (folderKey.isNullOrBlank()) return false
    val available = playableFolderTracks(playable)
    if (available.size < 2) return false
    val name = folderName?.takeIf { it.isNotBlank() } ?: folderNameFromKey(folderKey)
    return !isGenericFolderName(name)
}

/** The collection a track belongs to, or null when it stays standalone. */
fun resolveFolderCollection(track: Track, folderTracks: List<Track>): CollectionFolder? {
    if (track.origin != Origin.Local) return null
    val key = track.folderKey?.takeIf { it.isNotBlank() } ?: return null
    val playable = playableFolderTracks(folderTracks)
    val name = track.folderName?.takeIf { it.isNotBlank() } ?: folderNameFromKey(key)
    if (!isSemanticFolder(key, name, playable)) return null
    return CollectionFolder(key = key, name = name, tracks = orderFolderTracks(playable))
}
