package com.pejvak.app.domain

/**
 * Which files a device scan should consider (mirrors mobile/src/lib/audioFormats.ts).
 * The media index is already audio-filtered; a granted folder is not, and reading
 * artwork/PDFs would waste a megabyte and a SHA-256 on each. Pure.
 */

val AUDIO_EXTENSIONS: List<String> = listOf(
    "mp3", "m4a", "m4b", "m4p", "aac", "ogg", "oga", "opus", "flac",
    "wav", "wave", "aif", "aiff", "wma", "mp4", "mka", "amr", "3gp",
)

private val AUDIO_EXTENSION_SET = AUDIO_EXTENSIONS.toSet()

/** Lowercased extension without the dot, or null when there is none. */
fun fileExtension(fileName: String): String? {
    val dot = fileName.lastIndexOf('.')
    if (dot <= 0 || dot == fileName.length - 1) return null
    return fileName.substring(dot + 1).lowercase()
}

fun isAudioFileName(fileName: String): Boolean =
    fileExtension(fileName)?.let { it in AUDIO_EXTENSION_SET } == true

/** Best-effort MIME type, used to seed tracks.mime_type on import. */
fun mimeTypeForFileName(fileName: String): String? = when (fileExtension(fileName)) {
    "mp3" -> "audio/mpeg"
    "m4a", "m4b", "m4p", "mp4" -> "audio/mp4"
    "aac" -> "audio/aac"
    "ogg", "oga", "opus" -> "audio/ogg"
    "flac" -> "audio/flac"
    "wav", "wave" -> "audio/wav"
    "aif", "aiff" -> "audio/aiff"
    "wma" -> "audio/x-ms-wma"
    "mka" -> "audio/x-matroska"
    "amr" -> "audio/amr"
    "3gp" -> "audio/3gpp"
    else -> null
}

/** True when a URI points at a stream rather than a file on this device. */
fun isStreamUri(uri: String): Boolean =
    uri.startsWith("http://") || uri.startsWith("https://")