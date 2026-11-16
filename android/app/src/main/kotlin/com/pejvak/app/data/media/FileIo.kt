package com.pejvak.app.data.media

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.pejvak.app.domain.isStreamUri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.InputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Byte-level file access for the scan pipeline. Audio is referenced in place, so
 * every read goes through the device's own URI (file:// or a SAF content://).
 * A stream URL is never a file — callers must ask [isStreamUri] first.
 */
@Singleton
class FileIo @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /**
     * Reads up to [length] bytes starting at [position]. Returns fewer bytes at
     * EOF; an empty array when nothing can be read. Never throws for a normal
     * missing/short read — the caller decides what absence means.
     */
    fun readWindow(uri: String, position: Long, length: Int): ByteArray {
        if (length <= 0) return ByteArray(0)
        val parsed = Uri.parse(uri)
        return try {
            if (parsed.scheme == "file") {
                val file = File(parsed.path ?: return ByteArray(0))
                if (!file.isFile) return ByteArray(0)
                file.inputStream().use { stream ->
                    skipFully(stream, position)
                    readUpTo(stream, length)
                }
            } else {
                context.contentResolver.openInputStream(parsed)?.use { stream ->
                    skipFully(stream, position)
                    readUpTo(stream, length)
                } ?: ByteArray(0)
            }
        } catch (_: Exception) {
            ByteArray(0)
        }
    }

    /** Declared file size, or null when the provider will not say (never trust 0). */
    fun fileSize(uri: String): Long? {
        val parsed = Uri.parse(uri)
        return try {
            if (parsed.scheme == "file") {
                val file = File(parsed.path ?: return null)
                if (file.isFile) file.length() else null
            } else {
                context.contentResolver.query(parsed, null, null, null, null)?.use { cursor ->
                    val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (index >= 0 && cursor.moveToFirst()) {
                        val size = cursor.getLong(index)
                        if (size > 0) size else null
                    } else null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Whether a recorded location still resolves. Conservative: false only when
     * positively known gone; a failed check reports reachable so a broken stat
     * never re-points rows that were never lost. A null/empty URI is not reachable.
     */
    fun isReachable(uri: String?): Boolean {
        if (uri.isNullOrEmpty()) return false
        if (isStreamUri(uri)) return true
        val parsed = Uri.parse(uri)
        return try {
            if (parsed.scheme == "file") {
                File(parsed.path ?: return true).exists()
            } else {
                context.contentResolver.openInputStream(parsed)?.use { true } ?: false
            }
        } catch (_: Exception) {
            true
        }
    }

    private fun skipFully(stream: InputStream, position: Long) {
        var remaining = position
        while (remaining > 0) {
            val skipped = stream.skip(remaining)
            if (skipped <= 0) {
                // skip() may return 0; fall back to reading to advance.
                if (stream.read() == -1) break
                remaining -= 1
            } else {
                remaining -= skipped
            }
        }
    }

    private fun readUpTo(stream: InputStream, length: Int): ByteArray {
        val buffer = ByteArray(length)
        var filled = 0
        while (filled < length) {
            val read = stream.read(buffer, filled, length - filled)
            if (read == -1) break
            filled += read
        }
        return if (filled == length) buffer else buffer.copyOf(filled)
    }
}