package com.pejvak.app.domain

/**
 * Renders a track's notes as a portable Markdown document (mirrors
 * mobile/src/lib/exportAnnotations.ts). Pure, so the native share sheet only has
 * to hand the string to the OS.
 */
fun annotationsToMarkdown(track: Track, annotations: List<Annotation>): String {
    val lines = mutableListOf("# ${track.title.trim().ifEmpty { "Untitled" }}")
    if (!track.author.isNullOrEmpty()) {
        lines.add("")
        lines.add("_by ${track.author}_")
    }
    lines.add("")

    val sorted = annotations.sortedBy { it.positionSec }
    if (sorted.isEmpty()) {
        lines.add("_No annotations yet._")
        return lines.joinToString("\n")
    }

    for (note in sorted) {
        val tags = if (note.tags.isEmpty()) "" else " " + note.tags.joinToString(" ") { "#$it" }
        lines.add("- **[${formatClock(note.positionSec)}]** ${note.text.trim()}$tags")
    }
    return lines.joinToString("\n")
}
