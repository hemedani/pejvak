package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FolderPlayTest {
    private fun track(
        id: String,
        fileName: String = "$id.mp3",
        title: String = id,
        trackNumber: Int? = null,
        discNumber: Int? = null,
        availability: Availability = Availability.Present,
    ) = FolderPlayableTrack(id, fileName, title, 600, discNumber, trackNumber, availability)

    private fun progress(finished: Boolean, resumeSec: Int = 0) =
        FolderTrackProgress(finished, resumeSec)

    @Test
    fun `resume picks the first unfinished track and its saved position`() {
        val tracks = listOf(track("1"), track("2"), track("3"))
        val plan = buildFolderPlan(
            tracks,
            mapOf("1" to progress(true), "2" to progress(false, 90)),
        )
        assertEquals(listOf("1", "2", "3"), plan.queueIds)
        assertEquals(1, plan.startIndex)
        assertEquals(90, plan.startPositionSec)
    }

    @Test
    fun `all finished restarts at the top`() {
        val tracks = listOf(track("1"), track("2"))
        val plan = buildFolderPlan(
            tracks,
            mapOf("1" to progress(true), "2" to progress(true)),
        )
        assertEquals(0, plan.startIndex)
        assertEquals(0, plan.startPositionSec)
    }

    @Test
    fun `restart ignores progress and starts at zero`() {
        val plan = buildFolderPlan(
            listOf(track("1"), track("2")),
            mapOf("1" to progress(false, 120)),
            FolderPlayOptions(mode = FolderPlayMode.Restart),
        )
        assertEquals(0, plan.startIndex)
        assertEquals(0, plan.startPositionSec)
    }

    @Test
    fun `unfinished keeps only what is left and falls back to resume when none is left`() {
        val tracks = listOf(track("1"), track("2"), track("3"))
        val remaining = buildFolderPlan(
            tracks,
            mapOf("1" to progress(true), "2" to progress(false, 30), "3" to progress(true)),
            FolderPlayOptions(mode = FolderPlayMode.Unfinished),
        )
        assertEquals(listOf("2"), remaining.queueIds)
        assertEquals(30, remaining.startPositionSec)

        val done = buildFolderPlan(
            tracks,
            mapOf("1" to progress(true), "2" to progress(true), "3" to progress(true)),
            FolderPlayOptions(mode = FolderPlayMode.Unfinished),
        )
        assertEquals(listOf("1", "2", "3"), done.queueIds)
        assertEquals(0, done.startIndex)
    }

    @Test
    fun `shuffle is deterministic with an injected source and starts at zero`() {
        val plan = buildFolderPlan(
            listOf(track("1"), track("2"), track("3"), track("4")),
            emptyMap(),
            FolderPlayOptions(mode = FolderPlayMode.Shuffle, random = { 0.0 }),
        )
        assertEquals(listOf("2", "3", "4", "1"), plan.queueIds)
        assertEquals(0, plan.startPositionSec)
    }

    @Test
    fun `missing files are dropped from the queue and counted`() {
        val tracks = listOf(
            track("1", availability = Availability.Missing),
            track("2"),
        )
        val plan = buildFolderPlan(tracks, emptyMap())
        assertEquals(listOf("2"), plan.queueIds)
        assertEquals(1, plan.missingCount)
    }

    @Test
    fun `folder order prefers disc then track then natural file name`() {
        val tracks = listOf(
            track("c", fileName = "10.mp3", trackNumber = 10),
            track("a", fileName = "2.mp3", trackNumber = 2),
            track("b", fileName = "1.mp3", trackNumber = 1),
            track("d", fileName = "disc2.mp3", discNumber = 2, trackNumber = 1),
        )
        assertEquals(listOf("b", "a", "c", "d"), orderByFolder(tracks, { it.trackNumber }, { it.discNumber }, { it.fileName }, { it.title }).map { it.id })
    }

    @Test
    fun `progress ratio is clamped and empty folders report zero`() {
        assertEquals(0.0, folderProgressRatio(0, 0), 0.0)
        assertEquals(0.5, folderProgressRatio(2, 4), 0.0)
        assertEquals(1.0, folderProgressRatio(9, 4), 0.0)
    }

    @Test
    fun `progress copy speaks both ends plainly`() {
        assertEquals("Empty folder", describeFolderProgress(0, 0))
        assertEquals("1 track", describeFolderProgress(0, 1))
        assertEquals("3 tracks", describeFolderProgress(0, 3))
        assertEquals("1 of 3 finished", describeFolderProgress(1, 3))
        assertEquals("All 3 tracks finished", describeFolderProgress(3, 3))
        assertNull(describeMissing(0))
        assertEquals("1 file missing", describeMissing(1))
        assertEquals("2 files missing", describeMissing(2))
    }

    @Test
    fun `sort name reorders before resume picks the first unfinished`() {
        val tracks = listOf(
            FolderPlayableTrack("b", "b.mp3", "B", 600, null, null, Availability.Present),
            FolderPlayableTrack("a", "a.mp3", "A", 600, null, null, Availability.Present),
        )
        val plan = buildFolderPlan(
            tracks,
            mapOf("b" to progress(true)),
            FolderPlayOptions(mode = FolderPlayMode.Resume, sort = CollectionSort.Name),
        )
        assertEquals(listOf("a", "b"), plan.queueIds)
        assertEquals(0, plan.startIndex)
    }

    @Test
    fun `sort desc reverses the folder plan and keeps missing excluded`() {
        val tracks = listOf(
            FolderPlayableTrack("a", "a.mp3", "A", 600, null, null, Availability.Present),
            FolderPlayableTrack("b", "b.mp3", "B", 600, null, null, Availability.Present),
            FolderPlayableTrack("z", "z.mp3", "Z", 600, null, null, Availability.Missing),
        )
        val plan = buildFolderPlan(
            tracks,
            emptyMap(),
            FolderPlayOptions(
                mode = FolderPlayMode.Restart,
                sort = CollectionSort.Name,
                direction = SortDirection.Desc,
            ),
        )
        assertEquals(listOf("b", "a"), plan.queueIds)
        assertEquals(1, plan.missingCount)
    }

    @Test
    fun `sort shuffle produces the existing random plan`() {
        val tracks = listOf(track("1"), track("2"), track("3"), track("4"))
        val plan = buildFolderPlan(
            tracks,
            emptyMap(),
            FolderPlayOptions(sort = CollectionSort.Shuffle, random = { 0.0 }),
        )
        assertEquals(listOf("2", "3", "4", "1"), plan.queueIds)
    }

    @Test
    fun `row status says finished resume missing or not started`() {
        assertEquals("File missing", describeFolderTrackStatus(progress(true), track("x", availability = Availability.Missing)).label)
        assertEquals("Finished", describeFolderTrackStatus(progress(true), track("x")).label)
        assertEquals("Resume at 1:30", describeFolderTrackStatus(progress(false, 90), track("x")).label)
        assertEquals("Not started", describeFolderTrackStatus(null, track("x")).label)
    }
}
