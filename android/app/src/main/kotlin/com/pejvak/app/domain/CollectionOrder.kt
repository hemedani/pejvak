package com.pejvak.app.domain

/** Ordering rules for a folder or online collection. */
fun collectionSortOptions(type: ContextType): List<CollectionSort> = when (type) {
    ContextType.Folder -> listOf(
        CollectionSort.Folder,
        CollectionSort.Name,
        CollectionSort.Duration,
        CollectionSort.Shuffle,
    )
    ContextType.Online -> listOf(
        CollectionSort.Source,
        CollectionSort.Name,
        CollectionSort.Duration,
        CollectionSort.Shuffle,
    )
    ContextType.Playlist -> emptyList()
}

/** The sort a legacy row should fall back to for a given collection type. */
fun defaultCollectionSort(type: ContextType?): CollectionSort = when (type) {
    ContextType.Folder -> CollectionSort.Folder
    ContextType.Online -> CollectionSort.Source
    ContextType.Playlist -> CollectionSort.Manual
    null -> CollectionSort.Unknown
}

fun orderCollectionTracks(
    tracks: List<Track>,
    sort: CollectionSort,
    direction: SortDirection,
    random: () -> Double = { Math.random() },
): List<Track> = orderCollectionItems(
    items = tracks,
    sort = sort,
    direction = direction,
    random = random,
    id = { it.id },
    title = { it.title },
    durationSec = { it.durationSec },
    fileName = { it.fileName },
    trackNumber = { it.trackNumber },
    discNumber = { it.discNumber },
)

/**
 * The one ordering implementation for both real tracks and the structural subset
 * used by the folder plan, so the queue and the plan can never disagree.
 */
internal fun <T> orderCollectionItems(
    items: List<T>,
    sort: CollectionSort,
    direction: SortDirection,
    random: () -> Double,
    id: (T) -> String,
    title: (T) -> String,
    durationSec: (T) -> Int,
    fileName: (T) -> String?,
    trackNumber: (T) -> Int?,
    discNumber: (T) -> Int?,
): List<T> {
    if (sort == CollectionSort.Shuffle) return shuffleTracks(items, random)
    val ordered = when (sort) {
        CollectionSort.Folder -> orderByFolder(items, trackNumber, discNumber, fileName, title)
        CollectionSort.Source -> items
        CollectionSort.Name -> items.sortedWith { left, right ->
            val byTitle = naturalCompare(title(left), title(right))
            if (byTitle != 0) byTitle else id(left).compareTo(id(right))
        }
        CollectionSort.Duration -> items.sortedWith(
            compareBy<T> { durationSec(it) }
                .thenBy { title(it).lowercase() }
                .thenBy { id(it) },
        )
        else -> items
    }
    return if (direction == SortDirection.Desc) ordered.reversed() else ordered
}

/**
 * Reorders already-loaded rows to the plan's own sequence, so the visible list
 * and the queue can never disagree. Rows the plan leaves out (missing files,
 * finished tracks in Unfinished mode) keep their relative order at the end.
 */
fun <T> orderCollectionRows(
    items: List<T>,
    orderedIds: List<String>,
    id: (T) -> String,
): List<T> {
    if (orderedIds.isEmpty() || items.isEmpty()) return items
    val byId = items.associateBy(id)
    val ordered = orderedIds.mapNotNull { byId[it] }
    if (ordered.size == items.size) return ordered
    val included = ordered.mapTo(HashSet()) { id(it) }
    return ordered + items.filter { id(it) !in included }
}

/** Index of a track by id, falling back to the first item. */
fun collectionStartIndex(ids: List<String>, trackId: String?): Int {
    if (ids.isEmpty()) return 0
    val index = trackId?.let { ids.indexOf(it) } ?: -1
    return if (index >= 0) index else 0
}
