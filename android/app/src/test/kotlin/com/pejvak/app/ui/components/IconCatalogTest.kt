package com.pejvak.app.ui.components

import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins the semantic vocabulary screens rely on to real glyphs. */
class IconCatalogTest {

    private val required = listOf(
        "play", "pause", "next", "previous", "forward30", "replay30",
        "back", "close", "more", "search", "settings", "add", "edit", "delete",
        "check", "share", "refresh", "sync", "download", "history", "notes",
        "tag", "time", "timer", "sleep", "speed", "queue", "playlist",
        "addToPlaylist", "sort", "enhancer", "volume", "ai", "library",
        "discover", "folder", "online", "language", "favorite", "favoriteBorder",
        "person", "logout", "info", "warning", "error",
        "transcribe", "summarize", "audioSummary", "enhance", "sparkle",
        "cloud_upload", "cloud_done", "person_add",
    )

    @Test
    fun requiredVocabularyExists() {
        val missing = required.filter { it !in ICON_GLYPHS }
        assertTrue("missing glyphs: $missing", missing.isEmpty())
    }

    @Test
    fun fallbackGlyphExists() {
        assertTrue("info" in ICON_GLYPHS)
    }
}