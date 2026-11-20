package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ResumeSeedTest {

    private val run = ContextPlay(
        id = "run",
        contextType = ContextType.Folder,
        contextKey = "lectures",
        contextTitle = "Lectures",
        trackCount = 4,
        startedAt = 100,
        createdAt = 100,
        updatedAt = 100,
    )

    @Test
    fun `latest session supplies sort, audio facts and speed`() {
        val session = Session(
            id = "s",
            trackId = "t",
            contentHash = "h",
            startedAt = 100,
            collectionSort = CollectionSort.Name,
            collectionSortDirection = SortDirection.Desc,
            ambientTone = "forest",
            ambientLevel = 40,
            volumePercent = 65,
            enhancerEnabled = true,
            enhancerBoostDb = 3.0,
            playbackSpeed = 1.5,
            stretchId = "s",
            createdAt = 100,
            updatedAt = 100,
        )
        val seed = runResumeSeed(run, session)
        assertEquals(CollectionSort.Name, seed.conditions.collectionSort)
        assertEquals(SortDirection.Desc, seed.conditions.collectionSortDirection)
        assertEquals(65, seed.conditions.volumePercent)
        assertEquals(1.5, seed.speed!!, 0.0)
    }

    @Test
    fun `legacy run without a session defaults to its type order`() {
        val seed = runResumeSeed(run, null)
        assertEquals(CollectionSort.Folder, seed.conditions.collectionSort)
        assertEquals(SortDirection.Asc, seed.conditions.collectionSortDirection)
        assertEquals("Lectures", seed.conditions.contextTitle)
        assertNull(seed.speed)
    }
}
