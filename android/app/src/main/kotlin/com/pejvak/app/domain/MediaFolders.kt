package com.pejvak.app.domain

/** Folder naming + playback order (mirrors mobile/src/lib/mediaFolders.ts). Pure. */

const val STORAGE_ROOT_FOLDER_NAME: String = "Internal storage"
const val ROOT_FOLDER_ROUTE_SEGMENT: String = "~root"

fun folderNameFromKey(key: String): String {
    val trimmed = key.trimEnd('/')
    if (trimmed.isEmpty()) return STORAGE_ROOT_FOLDER_NAME
    return trimmed.split("/").lastOrNull()?.ifEmpty { null } ?: STORAGE_ROOT_FOLDER_NAME
}

fun folderKeyToRouteSegment(key: String): String = if (key.isEmpty()) ROOT_FOLDER_ROUTE_SEGMENT else key

fun folderKeyFromRouteSegment(segment: String?): String? = when (segment) {
    null -> null
    ROOT_FOLDER_ROUTE_SEGMENT -> ""
    else -> segment
}

/** `/storage/emulated/0/…`, `/storage/self/primary/…`, `/storage/1A2B-3C4D/…`. */
private val STORAGE_ROOT = Regex("^/storage/(?:emulated/\\d+|self/primary|[A-Za-z0-9-]+)/?")
private val SDCARD_ROOT = Regex("^/sdcard/?")

private fun stripFileScheme(value: String): String =
    if (value.startsWith("file://")) value.substring("file://".length) else value

private fun collapseSlashes(value: String): String = value.replace(Regex("/{2,}"), "/")

/** decodeURIComponent semantics (no `+` → space), or null on a malformed escape. */
private fun percentDecode(value: String): String? {
    val out = StringBuilder()
    val bytes = java.io.ByteArrayOutputStream()
    var i = 0
    fun flush() {
        if (bytes.size() > 0) {
            out.append(bytes.toString(Charsets.UTF_8))
            bytes.reset()
        }
    }
    while (i < value.length) {
        val c = value[i]
        if (c == '%') {
            if (i + 2 >= value.length) return null
            val hex = value.substring(i + 1, i + 3)
            val b = hex.toIntOrNull(16) ?: return null
            bytes.write(b)
            i += 3
        } else {
            flush()
            out.append(c)
            i += 1
        }
    }
    flush()
    return out.toString()
}

/**
 * Derives the folder key from a device file path. Null when the path is not a
 * usable filesystem path (a content:// URI); files directly in the storage root
 * yield "" — a real folder ("Internal storage"), not an absence of one.
 */
fun deriveFolderKey(path: String?): String? {
    if (path.isNullOrEmpty()) return null
    val withoutScheme = stripFileScheme(path)
    if (!withoutScheme.startsWith("/")) return null

    val relative = collapseSlashes(
        withoutScheme.replace(STORAGE_ROOT, "/").replace(SDCARD_ROOT, "/"),
    ).removePrefix("/")

    val lastSlash = relative.lastIndexOf('/')
    return if (lastSlash < 0) "" else relative.substring(0, lastSlash)
}

/**
 * Extracts a folder key from a SAF tree/document URI:
 * `…/tree/primary%3AMusic%2FLectures` → `Music/Lectures`. Providers that use a
 * bare name instead of a volume prefix keep it as-is.
 */
fun deriveFolderKeyFromTreeUri(treeUri: String): String? {
    val marker = if (treeUri.contains("/tree/")) "/tree/" else "/document/"
    val index = treeUri.indexOf(marker)
    if (index < 0) return null

    var decoded = percentDecode(treeUri.substring(index + marker.length)) ?: return null

    // Some providers append `/document/<child>` to a tree URI.
    val documentIndex = decoded.indexOf("/document/")
    if (documentIndex >= 0) decoded = decoded.substring(0, documentIndex)

    val colon = decoded.indexOf(':')
    val relative = if (colon >= 0) decoded.substring(colon + 1) else decoded
    return collapseSlashes(relative).trim('/')
}

/**
 * The tree form of a SAF document URI — rebuilds `…/tree/<documentId>` around
 * the child's own id (what DocumentsContract.buildTreeDocumentUri does). Null
 * when the URI is not a document URI or /document/ precedes /tree/.
 */
fun safTreeUriForDocument(uri: String): String? {
    val treeMarker = "/tree/"
    val documentMarker = "/document/"
    val treeIndex = uri.indexOf(treeMarker)
    val documentIndex = uri.indexOf(documentMarker)
    if (treeIndex < 0 || documentIndex < 0 || documentIndex < treeIndex) return null
    val authority = uri.substring(0, treeIndex)
    val documentId = uri.substring(documentIndex + documentMarker.length)
    return if (documentId.isEmpty()) null else "$authority$treeMarker$documentId"
}

/**
 * The file or directory name inside a SAF document URI — the volume prefix is
 * dropped and the last segment is the name. Listing returns only URIs, so this
 * is the only way to recover a name without a second provider call.
 */
fun safDocumentName(uri: String): String? {
    val marker = "/document/"
    val index = uri.indexOf(marker)
    val raw = if (index >= 0) uri.substring(index + marker.length)
    else uri.substring(uri.lastIndexOf('/') + 1)

    val decoded = percentDecode(raw) ?: return null
    val colon = decoded.indexOf(':')
    val relative = if (colon >= 0) decoded.substring(colon + 1) else decoded
    val slash = relative.lastIndexOf('/')
    val name = (if (slash >= 0) relative.substring(slash + 1) else relative).trim()
    return name.ifEmpty { null }
}

/** Natural sort: digit runs compare numerically (`02` == `2`, shorter first). */
fun naturalCompare(left: String, right: String): Int {
    val leftParts = Regex("\\d+|\\D+").findAll(left.lowercase()).map { it.value }.toList()
    val rightParts = Regex("\\d+|\\D+").findAll(right.lowercase()).map { it.value }.toList()
    val length = maxOf(leftParts.size, rightParts.size)
    for (i in 0 until length) {
        val a = leftParts.getOrNull(i) ?: return -1
        val b = rightParts.getOrNull(i) ?: return 1
        val aNumeric = a[0] in '0'..'9'
        val bNumeric = b[0] in '0'..'9'
        if (aNumeric && bNumeric) {
            val difference = a.toLong().compareTo(b.toLong())
            if (difference != 0) return difference
            if (a.length != b.length) return a.length - b.length
        } else {
            val difference = a.compareTo(b)
            if (difference != 0) return difference
        }
    }
    return 0
}

/**
 * Playback order for a folder. Track numbers are used only when every track has
 * one; otherwise a natural filename sort keeps the folder coherent.
 */
fun orderFolderTracks(tracks: List<Track>): List<Track> = orderByFolder(
    tracks,
    trackNumber = { it.trackNumber },
    discNumber = { it.discNumber },
    fileName = { it.fileName },
    title = { it.title },
)

fun <T> orderByFolder(
    tracks: List<T>,
    trackNumber: (T) -> Int?,
    discNumber: (T) -> Int?,
    fileName: (T) -> String?,
    title: (T) -> String,
): List<T> {
    val fullyNumbered = tracks.isNotEmpty() && tracks.all { trackNumber(it) != null }
    return tracks.sortedWith { left, right ->
        if (fullyNumbered) {
            val disc = (discNumber(left) ?: 1) - (discNumber(right) ?: 1)
            if (disc != 0) return@sortedWith disc
            val track = (trackNumber(left) ?: 0) - (trackNumber(right) ?: 0)
            if (track != 0) return@sortedWith track
        }
        naturalCompare(fileName(left) ?: title(left), fileName(right) ?: title(right))
    }
}

/** First not-finished track; when all finished, replay from the top (0). */
fun pickFolderStartIndex(finished: List<Boolean>): Int {
    val index = finished.indexOfFirst { !it }
    return if (index < 0) 0 else index
}