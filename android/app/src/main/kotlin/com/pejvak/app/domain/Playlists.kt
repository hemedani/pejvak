package com.pejvak.app.domain

/** Rewrites order to be contiguous from zero, preserving item sequence. */
fun normalizeOrder(items: List<PlaylistItem>): List<PlaylistItem> =
    items.mapIndexed { index, item -> PlaylistItem(item.trackId, index) }

fun addTrackToPlaylist(items: List<PlaylistItem>, trackId: String): List<PlaylistItem> =
    addTracksToPlaylist(items, listOf(trackId))

/** Adds tracks in order, skipping ones already present (and duplicates in the batch). */
fun addTracksToPlaylist(
    items: List<PlaylistItem>,
    trackIds: List<String>,
): List<PlaylistItem> {
    val present = items.mapTo(HashSet()) { it.trackId }
    val additions = ArrayList<PlaylistItem>()
    for (trackId in trackIds) {
        if (!present.add(trackId)) continue
        additions.add(PlaylistItem(trackId, items.size + additions.size))
    }
    return normalizeOrder(items + additions)
}

fun removeTracksFromPlaylist(
    items: List<PlaylistItem>,
    trackIds: List<String>,
): List<PlaylistItem> {
    val doomed = trackIds.toSet()
    return normalizeOrder(items.filter { it.trackId !in doomed })
}

fun removeTrackFromPlaylist(items: List<PlaylistItem>, trackId: String): List<PlaylistItem> =
    normalizeOrder(items.filter { it.trackId != trackId })

fun movePlaylistItem(items: List<PlaylistItem>, from: Int, to: Int): List<PlaylistItem> {
    if (from !in items.indices || to !in items.indices || from == to) return normalizeOrder(items)
    val next = items.toMutableList()
    val moved = next.removeAt(from)
    next.add(to, moved)
    return normalizeOrder(next)
}

fun orderedTrackIds(items: List<PlaylistItem>): List<String> =
    items.sortedBy { it.order }.map { it.trackId }

fun resolvePlaylistTracks(items: List<PlaylistItem>, tracks: List<Track>): List<Track> {
    val byId = tracks.associateBy { it.id }
    return items.sortedBy { it.order }.mapNotNull { byId[it.trackId] }
}
