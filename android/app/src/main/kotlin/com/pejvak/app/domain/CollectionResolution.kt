package com.pejvak.app.domain

/** A track plus the collection it resolves to, if any. Pure and Android-free. */
data class ResolvedCollection(
    val type: ContextType,
    val key: String,
    val title: String,
    val tracks: List<Track>,
    val sort: CollectionSort,
    val direction: SortDirection,
)

/**
 * Collection-first resolution, shared by every play entry point. Online metadata
 * wins when present; a local semantic folder comes next; otherwise the track is
 * standalone. A resumed item's sort is reused only when it is still valid for
 * the collection type, so a legacy null/Unknown falls back to the type default.
 */
fun resolvePlaybackCollection(
    track: Track,
    folderTracks: List<Track>,
    onlineTracks: List<Track>,
    inherited: PlaybackConditions? = null,
): ResolvedCollection? {
    if (track.origin == Origin.Online) {
        val key = track.collectionKey?.takeIf { it.isNotBlank() } ?: return null
        if (onlineTracks.isEmpty()) return null
        val (sort, direction) = sortFor(ContextType.Online, inherited)
        return ResolvedCollection(
            ContextType.Online,
            key,
            track.collectionTitle?.takeIf { it.isNotBlank() } ?: track.title,
            orderCollectionTracks(onlineTracks, sort, direction),
            sort,
            direction,
        )
    }
    if (track.origin != Origin.Local) return null
    val folder = resolveFolderCollection(track, folderTracks) ?: return null
    val (sort, direction) = sortFor(ContextType.Folder, inherited)
    return ResolvedCollection(
        ContextType.Folder,
        folder.key,
        folder.name,
        orderCollectionTracks(folder.tracks, sort, direction),
        sort,
        direction,
    )
}

fun sortFor(type: ContextType, inherited: PlaybackConditions?): Pair<CollectionSort, SortDirection> {
    val options = collectionSortOptions(type)
    val sort = inherited?.collectionSort?.takeIf { it in options } ?: defaultCollectionSort(type)
    val direction = if (sort == CollectionSort.Shuffle) {
        SortDirection.Asc
    } else {
        inherited?.collectionSortDirection ?: SortDirection.Asc
    }
    return sort to direction
}

/** Index of [trackId], or 0 when the resumed track is no longer available. */
fun resolveIndex(tracks: List<Track>, trackId: String): Int =
    tracks.indexOfFirst { it.id == trackId }.takeIf { it >= 0 } ?: 0
