package com.pejvak.app.core

/**
 * Persian/Arabic text folding for search and tag de-duplication (DESING.md §13).
 * The same word reaches the DB written several ways; a raw comparison finds only one
 * spelling. Fold once per data load, never per keystroke. Pure + tested.
 */
private fun foldChar(ch: Char): Char? = when (ch) {
    '\u064A', '\u0649' -> '\u06CC' // ي ى → ی
    '\u0643' -> '\u06A9'           // ك → ک
    '\u0623', '\u0625', '\u0622', '\u0671' -> '\u0627' // أ إ آ ٱ → ا
    '\u0629', '\u06C0' -> '\u0647' // ة ۀ → ه
    '\u0624' -> '\u0648'           // ؤ → و
    '\u0626' -> '\u06CC'           // ئ → ی
    in '\u06F0'..'\u06F9' -> ('0' + (ch - '\u06F0')) // Persian digits
    in '\u0660'..'\u0669' -> ('0' + (ch - '\u0660')) // Arabic-Indic digits
    '\u200C', '\u200D', '\u0640' -> null // ZWNJ, ZWJ, tatweel dropped
    in '\u064B'..'\u065F', '\u0670' -> null // harakat dropped
    else -> ch.lowercaseChar()
}

fun foldText(input: String): String {
    val sb = StringBuilder(input.length)
    for (ch in input) {
        foldChar(ch)?.let { sb.append(it) }
    }
    return sb.toString()
}

/**
 * A folded string plus the index in the original each folded character came from.
 * Whitespace is collapsed, so a match found in [text] can be reported as a range in
 * the original string — which is what lets a note row highlight the hit.
 */
data class FoldedText(val text: String, val map: List<Int>)

fun foldWithMap(input: String): FoldedText {
    val chars = StringBuilder(input.length)
    val map = ArrayList<Int>(input.length)
    var sawSpace = false
    for (index in input.indices) {
        val raw = input[index]
        if (raw.isWhitespace()) {
            sawSpace = chars.isNotEmpty()
            continue
        }
        val folded = foldChar(raw) ?: continue
        if (sawSpace) {
            chars.append(' ')
            map.add(index)
            sawSpace = false
        }
        chars.append(folded)
        map.add(index)
    }
    return FoldedText(chars.toString(), map)
}

/** The comparison form of a query, split into terms that must all hit. */
fun foldQuery(query: String): List<String> {
    val text = foldWithMap(query).text
    return if (text.isEmpty()) emptyList() else text.split(' ').filter { it.isNotEmpty() }
}

/** True when the first strong directional character is RTL (Persian/Arabic content). */
fun isRtlText(text: String): Boolean {
    for (ch in text) {
        when (Character.getDirectionality(ch)) {
            Character.DIRECTIONALITY_RIGHT_TO_LEFT,
            Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC,
            -> return true
            Character.DIRECTIONALITY_LEFT_TO_RIGHT -> return false
            else -> continue
        }
    }
    return false
}

/**
 * Length-preserving normalization for highlight range mapping: substitutions only
 * (no dropped chars), so indices in the folded string equal indices in the original.
 */
fun foldKeepLength(input: String): String {
    val sb = StringBuilder(input.length)
    for (ch in input) {
        val mapped = when (ch) {
            '\u064A', '\u0649', '\u0626' -> '\u06CC'
            '\u0643' -> '\u06A9'
            '\u0623', '\u0625', '\u0622', '\u0671' -> '\u0627'
            '\u0629', '\u06C0' -> '\u0647'
            '\u0624' -> '\u0648'
            in '\u06F0'..'\u06F9' -> ('0' + (ch - '\u06F0'))
            in '\u0660'..'\u0669' -> ('0' + (ch - '\u0660'))
            else -> ch
        }
        sb.append(mapped.lowercaseChar())
    }
    return sb.toString()
}

/** Highlight ranges of [query] inside [text], folded but index-aligned. */
fun highlightRanges(text: String, query: String): List<IntRange> {
    val q = foldKeepLength(query).trim()
    if (q.isEmpty()) return emptyList()
    val hay = foldKeepLength(text)
    val ranges = ArrayList<IntRange>()
    var from = 0
    while (true) {
        val idx = hay.indexOf(q, from)
        if (idx < 0) break
        ranges.add(idx until idx + q.length)
        from = idx + q.length
    }
    return ranges
}