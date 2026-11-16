package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanPlanTest {

    private fun file(
        name: String,
        uri: String = "file:///storage/emulated/0/$name",
        size: Long? = 1000,
        mtime: Long? = 5000,
        duration: Int = 600,
        folderKey: String? = "Lectures",
    ) = DiscoveredFile(
        sourceId = uri, uri = uri, path = uri.removePrefix("file://"), fileName = name,
        sizeBytes = size, modifiedAt = mtime, durationSec = duration,
        source = "mediastore", folderKey = folderKey, folderName = folderKey?.let { folderNameFromKey(it) },
    )

    private fun entry(
        hash: String,
        title: String,
        uri: String? = "file:///storage/emulated/0/$title.mp3",
        size: Long? = 1000,
        mtime: Long? = 5000,
        duration: Int = 600,
        availability: Availability = Availability.Present,
    ) = LibraryEntry(hash, uri, size, mtime, title, duration, availability)

    @Test
    fun `empty scan`() {
        val plan = buildScanPlan(emptyList(), emptyList())
        assertEquals(0, plan.summary.total)
        assertEquals(0, plan.summary.identifyCount)
    }

    @Test
    fun `new file needs identification`() {
        val plan = buildScanPlan(listOf(file("01 - Intro.mp3")), emptyList())
        assertEquals(ScanStatus.New, plan.candidates.single().status)
        assertEquals(1, plan.summary.identifyCount)
        assertTrue(needsIdentification(ScanStatus.New))
        assertTrue(needsIdentification(ScanStatus.Changed))
        assertTrue(needsIdentification(ScanStatus.Relink))
        assertFalse(needsIdentification(ScanStatus.Known))
        assertFalse(needsIdentification(ScanStatus.Duplicate))
    }

    @Test
    fun `same location unchanged is known`() {
        val f = file("01 - Intro.mp3")
        val plan = buildScanPlan(listOf(f), listOf(entry("h1", "01 - Intro", uri = f.uri)))
        assertEquals(ScanStatus.Known, plan.candidates.single().status)
        assertEquals(0, plan.summary.identifyCount)
    }

    @Test
    fun `same location changed mtime is changed`() {
        val f = file("01 - Intro.mp3", mtime = 9000)
        val plan = buildScanPlan(listOf(f), listOf(entry("h1", "01 - Intro", uri = f.uri)))
        assertEquals(ScanStatus.Changed, plan.candidates.single().status)
    }

    @Test
    fun `same location changed size is changed`() {
        val f = file("01 - Intro.mp3", size = 2000)
        val plan = buildScanPlan(listOf(f), listOf(entry("h1", "01 - Intro", uri = f.uri)))
        assertEquals(ScanStatus.Changed, plan.candidates.single().status)
    }

    @Test
    fun `near duplicate with matching duration is duplicate`() {
        val plan = buildScanPlan(
            listOf(file("01 - Intro.mp3", uri = "file:///other/01 - Intro.mp3")),
            listOf(entry("h1", "01 - Intro")),
        )
        val candidate = plan.candidates.single()
        assertEquals(ScanStatus.Duplicate, candidate.status)
        assertEquals("h1", candidate.duplicateOf)
    }

    @Test
    fun `title match with unknown duration is not a duplicate`() {
        val plan = buildScanPlan(
            listOf(file("01 - Intro.mp3", uri = "file:///other/01 - Intro.mp3", duration = 0)),
            listOf(entry("h1", "01 - Intro")),
        )
        assertEquals(ScanStatus.New, plan.candidates.single().status)
    }

    @Test
    fun `gone library row becomes relink`() {
        val plan = buildScanPlan(
            listOf(file("01 - Intro.mp3", uri = "file:///new/01 - Intro.mp3")),
            listOf(entry("h1", "01 - Intro", availability = Availability.Missing)),
        )
        val candidate = plan.candidates.single()
        assertEquals(ScanStatus.Relink, candidate.status)
        assertEquals("h1", candidate.duplicateOf)
    }

    @Test
    fun `caller-verified gone location becomes relink`() {
        val library = listOf(entry("h1", "01 - Intro"))
        val files = listOf(file("01 - Intro.mp3", uri = "file:///new/01 - Intro.mp3"))
        val plan = buildScanPlan(files, library, goneLocations = setOf(library.single().sourceUri!!))
        assertEquals(ScanStatus.Relink, plan.candidates.single().status)
    }

    @Test
    fun `gone duplicate preferred over present one`() {
        val plan = buildScanPlan(
            listOf(file("01 - Intro.mp3", uri = "file:///new/01 - Intro.mp3")),
            listOf(entry("present", "01 - Intro"), entry("gone", "01 - Intro", availability = Availability.Missing)),
        )
        assertEquals(ScanStatus.Relink, plan.candidates.single().status)
        assertEquals("gone", plan.candidates.single().duplicateOf)
    }

    @Test
    fun `scan siblings collapse to one import`() {
        val plan = buildScanPlan(
            listOf(
                file("01 - Intro.mp3", uri = "file:///a/01 - Intro.mp3"),
                file("01 - Intro.mp3", uri = "content://saf/01 - Intro.mp3"),
            ),
            emptyList(),
        )
        assertEquals(1, plan.summary.new)
        assertEquals(1, plan.summary.duplicate)
    }

    @Test
    fun `candidates sorted by folder then natural filename`() {
        val plan = buildScanPlan(
            listOf(
                file("10.mp3", folderKey = "B"),
                file("2.mp3", folderKey = "B"),
                file("1.mp3", folderKey = "A"),
            ),
            emptyList(),
        )
        assertEquals(listOf("1.mp3", "2.mp3", "10.mp3"), plan.candidates.map { it.file.fileName })
    }

    @Test
    fun `summary counts every status`() {
        val known = file("known.mp3")
        val plan = buildScanPlan(
            listOf(
                known,
                file("changed.mp3", mtime = 1),
                file("new.mp3"),
                file("known.mp3", uri = "file:///dup/known.mp3"),
            ),
            listOf(
                entry("hk", "known", uri = known.uri),
                entry("hc", "changed", uri = "file:///storage/emulated/0/changed.mp3"),
            ),
        )
        assertEquals(4, plan.summary.total)
        assertEquals(1, plan.summary.known)
        assertEquals(1, plan.summary.changed)
        assertEquals(1, plan.summary.new)
        assertEquals(1, plan.summary.duplicate)
        assertEquals(2, plan.summary.identifyCount)
    }

    @Test
    fun `normaliseTitle strips number extension and punctuation`() {
        assertEquals("thermodynamics", normaliseTitle("03 - Thermodynamics.mp3"))
        assertEquals("cafe", normaliseTitle("Café"))
        assertEquals("", normaliseTitle("..."))
    }

    @Test
    fun `libraryEntriesToVerify narrows to matching titles`() {
        val files = listOf(file("01 - Intro.mp3"))
        val library = listOf(
            entry("match", "01 - Intro"),
            entry("other", "Unrelated"),
            entry("missing", "01 - Intro", availability = Availability.Missing),
            entry("nouri", "01 - Intro", uri = null),
        )
        val verify = libraryEntriesToVerify(files, library)
        assertEquals(listOf("match"), verify.map { it.contentHash })
    }

    @Test
    fun `toEpochMillis normalises seconds and millis`() {
        assertEquals(null, toEpochMillis(null))
        assertEquals(null, toEpochMillis(0))
        assertEquals(1_700_000_000_000L, toEpochMillis(1_700_000_000L))
        assertEquals(1_700_000_000_000L, toEpochMillis(1_700_000_000_000L))
    }

    @Test
    fun `isSameFileName ignores case and whitespace`() {
        assertTrue(isSameFileName(" Foo.MP3 ", "foo.mp3"))
        assertFalse(isSameFileName("foo.mp3", "bar.mp3"))
    }
}