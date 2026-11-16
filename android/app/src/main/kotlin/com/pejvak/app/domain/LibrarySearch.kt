package com.pejvak.app.domain

import com.pejvak.app.core.FoldedText
import com.pejvak.app.core.foldWithMap

/**
 * Library search: fold each field once per data load, then rank a query by how
 * well it matched before which field it matched in. Mirrors the RN engine, and
 * keeps the title as the only field that carries highlight ranges.
 */

enum class LibraryField { Title, Author, Album, Narrator, FileName, Folder, Path, Description, Track }

fun describeLibraryField(field: LibraryField): String = when (field) {
    LibraryField.Author -> "author"
    LibraryField.Album -> "album"
    LibraryField.Narrator -> "narrator"
    LibraryField.FileName -> "file name"
    LibraryField.Folder -> "folder"
    LibraryField.Path -> "path"
    LibraryField.Description -> "description"
    LibraryField.Track -> "track"
    LibraryField.Title -> "title"
}

data class SearchField(val field: LibraryField, val value: String?)

enum class MatchQuality(val rank: Int) {
    Exact(4), Prefix(3), Word(2), Substring(1)
}

data class IndexedField(val field: LibraryField, val value: String, val folded: FoldedText)

data class SearchEntry<T>(val item: T, val titleField: LibraryField, val fields: List<IndexedField>)

data class SearchHit<T>(
    val item: T,
    val field: LibraryField,
    val value: String,
    val quality: MatchQuality,
    val ranges: List<IntRange>,
)

data class FoldMatch(val quality: MatchQuality, val ranges: List<IntRange>, val position: Int)

private fun qualityOf(haystack: String, term: String): MatchQuality? {
    val at = haystack.indexOf(term)
    if (at < 0) return null
    if (haystack == term) return MatchQuality.Exact
    if (at == 0) return MatchQuality.Prefix
    return if (haystack[at - 1] == ' ') MatchQuality.Word else MatchQuality.Substring
}

fun matchFolded(haystack: FoldedText, terms: List<String>): FoldMatch? {
    if (terms.isEmpty()) return null
    val ranges = ArrayList<IntRange>()
    var best: MatchQuality? = null
    var position = Int.MAX_VALUE
    for (term in terms) {
        if (term.isEmpty()) return null
        val quality = qualityOf(haystack.text, term) ?: return null
        if (best == null || quality.rank > best.rank) best = quality
        val at = haystack.text.indexOf(term)
        val start = haystack.map[at]
        val end = haystack.map[at + term.length - 1] + 1
        ranges.add(start until end)
        position = minOf(position, start)
    }
    ranges.sortBy { it.first }
    return FoldMatch(best ?: MatchQuality.Substring, ranges, position)
}

fun matchOne(haystack: String, terms: List<String>): FoldMatch? =
    matchFolded(foldWithMap(haystack), terms)

fun <T> createSearchIndex(
    items: List<T>,
    titleField: LibraryField = LibraryField.Title,
    fieldsOf: (T) -> List<SearchField>,
): List<SearchEntry<T>> = items.map { item ->
    val fields = fieldsOf(item).mapNotNull { spec ->
        val value = spec.value
        if (value.isNullOrEmpty()) null
        else IndexedField(spec.field, value, foldWithMap(value))
    }
    SearchEntry(item, titleField, fields)
}

fun <T> searchIndex(entries: List<SearchEntry<T>>, terms: List<String>): List<SearchHit<T>> {
    if (terms.isEmpty()) return emptyList()
    data class Scored(val hit: SearchHit<T>, val position: Int, val order: Int)
    val scored = ArrayList<Scored>()
    entries.forEachIndexed { order, entry ->
        var best: SearchHit<T>? = null
        var bestPosition = Int.MAX_VALUE
        for (indexed in entry.fields) {
            val match = matchFolded(indexed.folded, terms) ?: continue
            val candidate = SearchHit(
                item = entry.item,
                field = indexed.field,
                value = indexed.value,
                quality = match.quality,
                ranges = if (indexed.field == entry.titleField) match.ranges else emptyList(),
            )
            val better = best == null ||
                candidate.quality.rank > best.quality.rank ||
                (candidate.quality == best.quality && indexed.field == entry.titleField)
            if (better) {
                best = candidate
                bestPosition = match.position
            }
        }
        if (best != null) scored.add(Scored(best, bestPosition, order))
    }
    return scored.sortedWith(
        compareByDescending<Scored> { it.hit.quality.rank }
            .thenBy { it.position }
            .thenBy { it.order },
    ).map { it.hit }
}

fun <T> searchItems(
    items: List<T>,
    terms: List<String>,
    titleField: LibraryField = LibraryField.Title,
    fieldsOf: (T) -> List<SearchField>,
): List<SearchHit<T>> = searchIndex(createSearchIndex(items, titleField, fieldsOf), terms)

fun trackSearchFields(track: Track): List<SearchField> = listOf(
    SearchField(LibraryField.Title, track.title),
    SearchField(LibraryField.Author, track.author),
    SearchField(LibraryField.Album, track.album),
    SearchField(LibraryField.Narrator, track.narrator),
    SearchField(LibraryField.FileName, track.fileName),
    SearchField(LibraryField.Folder, track.folderName ?: track.collectionTitle),
    SearchField(LibraryField.Path, track.folderKey ?: track.sourcePath),
)

fun folderSearchFields(folder: Folder): List<SearchField> = listOf(
    SearchField(LibraryField.Title, folder.name),
    SearchField(LibraryField.Path, folder.key),
)

fun playlistSearchFields(playlist: Playlist): List<SearchField> = listOf(
    SearchField(LibraryField.Title, playlist.title),
    SearchField(LibraryField.Description, playlist.description),
)
