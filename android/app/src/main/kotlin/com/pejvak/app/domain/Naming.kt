package com.pejvak.app.domain

/**
 * File/folder naming for downloaded audio (mirrors mobile/src/lib/online/naming.ts).
 * Pure. Source titles are hostile input (Persian prose with /, quotes, emoji, long
 * headlines); every name passes the same sanitiser. The source id is part of the
 * folder name so two same-titled shows never overwrite each other.
 */
const val ONLINE_ROOT: String = "Online"

private val ILLEGAL = Regex("[\\\\/:*?\"<>|]")
private val CONTROL = Regex("[\\u0000-\\u001F\\u007F\\u200E\\u200F\\u202A-\\u202E]")
private const val MAX_SEGMENT = 90

fun sanitizeSegment(value: String, fallback: String = "Untitled"): String {
    val cleaned = value
        .replace(CONTROL, "")
        .replace(ILLEGAL, "-")
        .replace(Regex("\\s+"), " ")
        .trim()
        .replace(Regex("[. ]+$"), "")
    if (cleaned.isEmpty()) return fallback
    if (cleaned.length <= MAX_SEGMENT) return cleaned
    val clipped = cleaned.substring(0, MAX_SEGMENT)
    val lastSpace = clipped.lastIndexOf(' ')
    return (if (lastSpace > MAX_SEGMENT * 0.6) clipped.substring(0, lastSpace) else clipped).trim()
}

fun slugify(value: String, fallback: String): String {
    val slug = value.lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .replace(Regex("^-+|-+$"), "")
        .take(60)
    return slug.ifEmpty { fallback }
}

fun collectionFolderKey(sourceId: String, externalId: String): String =
    "$ONLINE_ROOT/$sourceId/$externalId"

data class ParsedFolderKey(val sourceId: String, val kind: DownloadScopeKind)

fun parseDownloadedFolderKey(key: String): ParsedFolderKey? {
    if (!key.startsWith("$ONLINE_ROOT/")) return null
    val rest = key.substring(ONLINE_ROOT.length + 1)
    val sourceId = rest.split("/").firstOrNull().orEmpty()
    if (sourceId.isEmpty()) return null
    return ParsedFolderKey(sourceId, if (rest.contains("::series::")) DownloadScopeKind.Series else DownloadScopeKind.Collection)
}

fun collectionRelativePath(sourceId: String, collectionTitle: String, externalId: String): String {
    val title = sanitizeSegment(collectionTitle, slugify(collectionTitle, externalId))
    return listOf(
        ONLINE_ROOT,
        sanitizeSegment(sourceId, "source"),
        "$title (${sanitizeSegment(externalId, "collection")})",
    ).joinToString("/")
}

fun seriesScopeKey(collectionKey: String, seed: String): String =
    "$collectionKey::series::${sanitizeSegment(seed, "series")}"

fun seriesSeedOf(scopeKey: String): String? {
    val index = scopeKey.indexOf("::series::")
    return if (index < 0) null else scopeKey.substring(index + "::series::".length)
}

fun seriesFolderKey(sourceId: String, collectionExternalId: String, seed: String): String =
    "${collectionFolderKey(sourceId, collectionExternalId)}::series::${sanitizeSegment(seed, "series")}"

fun seriesRelativePath(
    sourceId: String,
    collectionTitle: String,
    collectionExternalId: String,
    seriesTitle: String,
    seed: String,
): String {
    val collection = sanitizeSegment(collectionTitle, slugify(collectionTitle, collectionExternalId))
    val series = sanitizeSegment(seriesTitle, "Series")
    return listOf(
        ONLINE_ROOT,
        sanitizeSegment(sourceId, "source"),
        "$collection - $series (${sanitizeSegment(seed, "series")})",
    ).joinToString("/")
}

private val DOWNLOAD_AUDIO_EXTENSIONS = setOf("mp3", "m4a", "mp4", "aac", "ogg", "opus", "wav", "flac")

fun extensionFromUrl(url: String, fallback: String = "mp3"): String {
    val path = url.substringBefore("?").substringBefore("#")
    val match = Regex("\\.([a-z0-9]{2,5})$", RegexOption.IGNORE_CASE).find(path) ?: return fallback
    val ext = match.groupValues[1].lowercase()
    return if (ext in DOWNLOAD_AUDIO_EXTENSIONS) ext else fallback
}

fun trackFileName(order: Int, title: String, streamUrl: String): String {
    val position = maxOf(1, order)
    val padded = position.toString().padStart(2, '0')
    return "$padded - ${sanitizeSegment(title, "Track $padded")}.${extensionFromUrl(streamUrl)}"
}

fun formatArchiveDuration(value: Any?): Int {
    if (value is Number) {
        val seconds = value.toDouble()
        return if (seconds.isFinite() && seconds > 0) Math.round(seconds).toInt() else 0
    }
    val text = (value as? String)?.trim().orEmpty()
    if (text.isEmpty()) return 0
    if (text.contains(':')) {
        val parts = text.split(':')
        if (parts.size !in 2..3) return 0
        var total = 0
        for (part in parts) {
            if (part.isEmpty() || part.any { !it.isDigit() }) return 0
            total = total * 60 + part.toInt()
        }
        return total
    }
    if (!Regex("^\\d+(\\.\\d+)?$").matches(text)) return 0
    val seconds = text.toDoubleOrNull() ?: return 0
    return if (seconds.isFinite() && seconds > 0) Math.round(seconds).toInt() else 0
}
