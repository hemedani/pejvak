package com.pejvak.app.domain

import java.security.MessageDigest

/**
 * A track's identity is SHA-256(first 1 MB of audio bytes || decimal file size).
 * Online identity is SHA-256("online:<sourceId>:<externalId>") — the source's own
 * id, never the (signed, rotating) stream URL. Pure JVM; the file reader wiring
 * lives in the data layer. Mirrors mobile/src/lib/contentHash.ts byte-for-byte.
 */
const val CONTENT_HASH_CHUNK_BYTES: Int = 1024 * 1024

fun toHex(bytes: ByteArray): String {
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
        val v = b.toInt() and 0xff
        sb.append(v.toString(16).padStart(2, '0'))
    }
    return sb.toString()
}

/** The exact bytes that get hashed: the chunk followed by the decimal file size. */
fun buildHashInput(chunk: ByteArray, fileSizeBytes: Long): ByteArray {
    val sizeBytes = fileSizeBytes.toString().toByteArray(Charsets.UTF_8)
    val input = ByteArray(chunk.size + sizeBytes.size)
    System.arraycopy(chunk, 0, input, 0, chunk.size)
    System.arraycopy(sizeBytes, 0, input, chunk.size, sizeBytes.size)
    return input
}

private fun sha256(bytes: ByteArray): ByteArray =
    MessageDigest.getInstance("SHA-256").digest(bytes)

fun contentHashFromChunk(chunk: ByteArray, fileSizeBytes: Long): String =
    toHex(sha256(buildHashInput(chunk, fileSizeBytes)))

fun onlineIdentity(sourceId: String, externalId: String): String =
    "online:$sourceId:$externalId"

fun hashOnlineIdentity(sourceId: String, externalId: String): String =
    toHex(sha256(onlineIdentity(sourceId, externalId).toByteArray(Charsets.UTF_8)))