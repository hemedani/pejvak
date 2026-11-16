package com.pejvak.app.domain

import com.pejvak.app.core.foldText

/** Tag rules shared by the composer and the repository (mirrors mobile/src/lib/tags.ts). */
const val MAX_TAGS = 10
const val MAX_TAG_LENGTH = 24

enum class TagRejectReason { Empty, TooLong, Duplicate, Limit }

data class TagResult(
    val tags: List<String>,
    val added: Boolean,
    val reason: TagRejectReason? = null,
)

private fun cleanTag(raw: String): String = raw.trim().replace(Regex("\\s+"), " ")

/**
 * Adds one draft tag, trimming it and refusing duplicates by the Persian fold.
 * Returns the unchanged list on rejection so the caller can show why.
 */
fun addTag(
    tags: List<String>,
    draft: String,
    maxTags: Int = MAX_TAGS,
    maxLength: Int = MAX_TAG_LENGTH,
): TagResult {
    val cleaned = cleanTag(draft)
    if (cleaned.isEmpty()) return TagResult(tags, added = false, reason = TagRejectReason.Empty)
    if (cleaned.length > maxLength) return TagResult(tags, added = false, reason = TagRejectReason.TooLong)
    if (tags.size >= maxTags) return TagResult(tags, added = false, reason = TagRejectReason.Limit)
    val folded = foldText(cleaned)
    if (tags.any { foldText(it) == folded }) {
        return TagResult(tags, added = false, reason = TagRejectReason.Duplicate)
    }
    return TagResult(tags + cleaned, added = true)
}

fun removeTag(tags: List<String>, index: Int): List<String> {
    if (index !in tags.indices) return tags.toList()
    return tags.filterIndexed { i, _ -> i != index }
}

/** Clean a free-form tag list: trim, collapse, drop empties, fold-dedupe, cap. */
fun normalizeTags(tags: List<String>): List<String> {
    val seen = HashSet<String>()
    val result = ArrayList<String>(minOf(tags.size, MAX_TAGS))
    for (raw in tags) {
        val cleaned = cleanTag(raw)
        if (cleaned.isEmpty() || cleaned.length > MAX_TAG_LENGTH) continue
        if (!seen.add(foldText(cleaned))) continue
        result.add(cleaned)
        if (result.size == MAX_TAGS) break
    }
    return result
}
