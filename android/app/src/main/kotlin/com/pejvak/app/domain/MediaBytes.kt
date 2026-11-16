package com.pejvak.app.domain

/**
 * Reading binary media structures out of a byte window (mirrors
 * mobile/src/lib/mediaBytes.ts). Shared by the tag reader, the stream inspector
 * and the artwork reader. Every reader takes an offset and returns a value
 * rather than throwing — "past the end" is normal for a window, not exceptional.
 */

private fun Byte.u(): Int = toInt() and 0xff

fun readUint16BE(bytes: ByteArray, offset: Int): Int =
    ((bytes.getOrElse(offset) { 0 }.u()) shl 8) or bytes.getOrElse(offset + 1) { 0 }.u()

fun readUint32BE(bytes: ByteArray, offset: Int): Long =
    ((bytes.getOrElse(offset) { 0 }.u().toLong()) shl 24) or
        ((bytes.getOrElse(offset + 1) { 0 }.u().toLong()) shl 16) or
        ((bytes.getOrElse(offset + 2) { 0 }.u().toLong()) shl 8) or
        bytes.getOrElse(offset + 3) { 0 }.u().toLong()

fun readUint16LE(bytes: ByteArray, offset: Int): Int =
    bytes.getOrElse(offset) { 0 }.u() or (bytes.getOrElse(offset + 1) { 0 }.u() shl 8)

fun readUint32LE(bytes: ByteArray, offset: Int): Long =
    bytes.getOrElse(offset) { 0 }.u().toLong() or
        (bytes.getOrElse(offset + 1) { 0 }.u().toLong() shl 8) or
        (bytes.getOrElse(offset + 2) { 0 }.u().toLong() shl 16) or
        (bytes.getOrElse(offset + 3) { 0 }.u().toLong() shl 24)

fun readAscii(bytes: ByteArray, offset: Int, length: Int): String {
    val sb = StringBuilder(length)
    for (i in 0 until length) sb.append(bytes.getOrElse(offset + i) { 0 }.u().toChar())
    return sb.toString()
}

/** Case-sensitive ASCII signature test. Bounds are checked, not assumed. */
fun matchesAscii(bytes: ByteArray, offset: Int, text: String): Boolean {
    if (offset < 0 || offset + text.length > bytes.size) return false
    for (i in text.indices) {
        if (bytes[offset + i].u() != text[i].code) return false
    }
    return true
}

// --- ISO base media (MP4) boxes ---

data class Atom(val type: String, val start: Int, val end: Int, val headerBytes: Int)

/** Reads one box header at [offset], or null when it does not fit the window. */
fun readAtom(bytes: ByteArray, offset: Int): Atom? {
    if (offset + 8 > bytes.size) return null
    var size = readUint32BE(bytes, offset)
    val type = readAscii(bytes, offset + 4, 4)
    var headerBytes = 8
    if (size == 1L) {
        // 64-bit extended size, for boxes past 4 GB.
        if (offset + 16 > bytes.size) return null
        size = readUint32BE(bytes, offset + 8) * 0x100000000L + readUint32BE(bytes, offset + 12)
        headerBytes = 16
    } else if (size == 0L) {
        // "To the end of the file".
        size = (bytes.size - offset).toLong()
    }
    if (size < headerBytes || offset + size > bytes.size) return null
    return Atom(type, offset, offset + size.toInt(), headerBytes)
}

/** Every box in [from, to), stopping at the first one that overruns. */
fun childAtoms(bytes: ByteArray, from: Int, to: Int): List<Atom> {
    val atoms = mutableListOf<Atom>()
    var offset = from
    while (offset < to) {
        val atom = readAtom(bytes, offset) ?: break
        if (atom.end > to) break
        atoms.add(atom)
        offset = atom.end
    }
    return atoms
}

fun findChild(bytes: ByteArray, parent: Atom, type: String): Atom? =
    childAtoms(bytes, parent.start + parent.headerBytes, parent.end).firstOrNull { it.type == type }

/**
 * Descends a path of box types, e.g. ["udta", "meta", "ilst"]. `meta` is a *full*
 * box — four bytes of version/flags precede its children — so the walker
 * compensates for it by name.
 */
fun findDescendant(bytes: ByteArray, parent: Atom, path: List<String>): Atom? {
    var current: Atom? = parent
    for (type in path) {
        val cur = current ?: return null
        val found = findChild(bytes, cur, type) ?: return null
        current = if (type == "meta") {
            Atom(found.type, found.start + found.headerBytes + 4, found.end, 0)
        } else found
    }
    return current
}

/**
 * Locates `moov` in a window that does not begin at the file's start. The
 * window's own offset is not box-aligned, so the box is found by its type and
 * its size read from the four bytes before it; the size is validated against
 * the real file length because `moov` spells common inside compressed audio.
 */
fun scanForMoov(bytes: ByteArray, fileSizeBytes: Long, base: Long): Atom? {
    var offset = 4
    while (offset + 8 <= bytes.size) {
        if (matchesAscii(bytes, offset, "moov")) {
            val start = offset - 4
            val size = readUint32BE(bytes, start)
            if (size >= 8 && base + start + size <= fileSizeBytes) {
                return Atom("moov", start, minOf(bytes.size.toLong(), start + size).toInt(), 8)
            }
        }
        offset += 1
    }
    return null
}