package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackConditionsTest {

    private fun session(
        contextType: ContextType? = null,
        contextTitle: String? = null,
        collectionSort: CollectionSort? = null,
        collectionSortDirection: SortDirection? = null,
        collectionIndex: Int? = null,
        collectionSize: Int? = null,
        ambientTone: String? = null,
        ambientLevel: Int? = null,
        volumePercent: Int? = null,
        enhancerEnabled: Boolean? = null,
        enhancerBoostDb: Double? = null,
        enhancerBassDb: Double? = null,
        enhancerTrebleDb: Double? = null,
    ) = Session(
        id = "s1",
        trackId = "t1",
        contentHash = "h",
        startedAt = 1000,
        stretchId = "s1",
        createdAt = 1000,
        updatedAt = 1000,
        contextType = contextType,
        contextTitle = contextTitle,
        collectionSort = collectionSort,
        collectionSortDirection = collectionSortDirection,
        collectionIndex = collectionIndex,
        collectionSize = collectionSize,
        ambientTone = ambientTone,
        ambientLevel = ambientLevel,
        volumePercent = volumePercent,
        enhancerEnabled = enhancerEnabled,
        enhancerBoostDb = enhancerBoostDb,
        enhancerBassDb = enhancerBassDb,
        enhancerTrebleDb = enhancerTrebleDb,
    )

    @Test
    fun `bare session reads the documented defaults`() {
        val conditions = session().playbackConditions()
        assertEquals(PlaybackConditions(), conditions)
        assertNull(conditions.contextTitle)
        assertEquals(CollectionSort.Unknown, conditions.collectionSort)
        assertEquals(SortDirection.Asc, conditions.collectionSortDirection)
        assertEquals(0, conditions.collectionIndex)
        assertEquals(0, conditions.collectionSize)
        assertEquals("none", conditions.ambientTone)
        assertEquals(0, conditions.ambientLevel)
        assertEquals(100, conditions.volumePercent)
        assertEquals(false, conditions.enhancerEnabled)
        assertEquals(0.0, conditions.enhancerBoostDb, 0.0)
        assertEquals(0.0, conditions.enhancerBassDb, 0.0)
        assertEquals(0.0, conditions.enhancerTrebleDb, 0.0)
    }

    @Test
    fun `recorded session values are preserved`() {
        val conditions = session(
            contextType = ContextType.Folder,
            contextTitle = "Lectures",
            collectionSort = CollectionSort.Folder,
            collectionSortDirection = SortDirection.Desc,
            collectionIndex = 2,
            collectionSize = 5,
            ambientTone = "forest",
            ambientLevel = 30,
            volumePercent = 70,
            enhancerEnabled = true,
            enhancerBoostDb = 3.0,
            enhancerBassDb = -1.5,
            enhancerTrebleDb = 2.0,
        ).playbackConditions()

        assertEquals("Lectures", conditions.contextTitle)
        assertEquals(CollectionSort.Folder, conditions.collectionSort)
        assertEquals(SortDirection.Desc, conditions.collectionSortDirection)
        assertEquals(2, conditions.collectionIndex)
        assertEquals(5, conditions.collectionSize)
        assertEquals("forest", conditions.ambientTone)
        assertEquals(30, conditions.ambientLevel)
        assertEquals(70, conditions.volumePercent)
        assertEquals(true, conditions.enhancerEnabled)
        assertEquals(3.0, conditions.enhancerBoostDb, 0.0)
        assertEquals(-1.5, conditions.enhancerBassDb, 0.0)
        assertEquals(2.0, conditions.enhancerTrebleDb, 0.0)
    }

    @Test
    fun `collection kind is derived from context type`() {
        assertEquals(CollectionKind.Standalone, HistoryItem(session(), track()).collectionKind())
        assertEquals(
            CollectionKind.Collection,
            HistoryItem(session(contextType = ContextType.Playlist), track()).collectionKind(),
        )
    }

    @Test
    fun `normalize applies defaults and clamps percentages`() {
        val defaults = normalizePlaybackConditions()
        assertEquals(PlaybackConditions(), defaults)

        val clamped = normalizePlaybackConditions(
            collectionIndex = -3,
            collectionSize = -1,
            ambientTone = "  ",
            ambientLevel = 140,
            volumePercent = -20,
            enhancerBoostDb = Double.NaN,
        )
        assertEquals(0, clamped.collectionIndex)
        assertEquals(0, clamped.collectionSize)
        assertEquals("none", clamped.ambientTone)
        assertEquals(100, clamped.ambientLevel)
        assertEquals(0, clamped.volumePercent)
        assertEquals(0.0, clamped.enhancerBoostDb, 0.0)
    }

    @Test
    fun `describe builds ordered facts and omits empty ones`() {
        val conditions = PlaybackConditions(
            collectionSort = CollectionSort.Manual,
            collectionIndex = 2,
            collectionSize = 5,
            ambientTone = "forest",
            ambientLevel = 30,
            volumePercent = 70,
            enhancerEnabled = true,
            enhancerBoostDb = 3.0,
        )
        assertEquals(
            listOf("Manual, 3 of 5", "Forest, level 30", "Volume 70%", "Enhancer +3 dB"),
            describePlaybackConditions(conditions),
        )
        assertEquals(listOf("Volume 100%"), describePlaybackConditions(PlaybackConditions()))
    }

    @Test
    fun `markdown context joins title and facts`() {
        val conditions = PlaybackConditions(
            contextTitle = "Lectures",
            collectionSort = CollectionSort.Manual,
            collectionIndex = 2,
            collectionSize = 5,
            ambientTone = "forest",
            ambientLevel = 30,
            volumePercent = 70,
            enhancerEnabled = true,
            enhancerBoostDb = 3.0,
        )
        assertEquals(
            "Lectures · Manual, 3 of 5 · Forest, level 30 · Volume 70% · Enhancer +3 dB",
            playbackMarkdownContext(conditions),
        )
        assertEquals("Volume 100%", playbackMarkdownContext(PlaybackConditions()))
    }

    private fun track() = Track(id = "t1", contentHash = "h", title = "T", createdAt = 1, updatedAt = 1)
}
