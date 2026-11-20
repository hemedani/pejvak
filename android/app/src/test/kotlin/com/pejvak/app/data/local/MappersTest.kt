package com.pejvak.app.data.local

import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.DownloadJob
import com.pejvak.app.domain.DownloadJobState
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.PlaybackConditions
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.PlaylistItem
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.playbackConditions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Mapper round-trips (entity ↔ domain). Entities are plain data classes, so this
 * runs on the JVM. Verifies enum wire mapping and JSON columns (tags, items).
 */
class MappersTest {

    @Test
    fun trackRoundTrip() {
        val track = Track(id = "t1", contentHash = "h", title = "T", durationSec = 600, syncStatus = SyncStatus.Synced, createdAt = 1, updatedAt = 2)
        assertEquals(track, track.toEntity().toDomain())
    }

    @Test
    fun sessionRoundTrip() {
        val session = Session(
            id = "s1", trackId = "t1", contentHash = "h", startedAt = 10, endedAt = 20,
            endPositionSec = 100, durationListenedSec = 90, playbackSpeed = 1.5, completed = true,
            stretchId = "s1", contextType = ContextType.Folder, contextKey = "Lectures", createdAt = 10, updatedAt = 20,
        )
        assertEquals(session, session.toEntity().toDomain())
    }

    @Test
    fun sessionPlaybackSnapshotRoundTrip() {
        val session = Session(
            id = "s1", trackId = "t1", contentHash = "h", startedAt = 10,
            stretchId = "s1", contextType = ContextType.Folder, contextKey = "Lectures",
            createdAt = 10, updatedAt = 20,
            contextTitle = "Lectures", collectionSort = CollectionSort.Folder,
            collectionSortDirection = SortDirection.Desc, collectionIndex = 2, collectionSize = 5,
            ambientTone = "forest", ambientLevel = 30, volumePercent = 70,
            enhancerEnabled = true, enhancerBoostDb = 3.0, enhancerBassDb = -1.5, enhancerTrebleDb = 2.0,
        )
        assertEquals(session, session.toEntity().toDomain())
        assertEquals(
            PlaybackConditions(
                contextTitle = "Lectures", collectionSort = CollectionSort.Folder,
                collectionSortDirection = SortDirection.Desc, collectionIndex = 2, collectionSize = 5,
                ambientTone = "forest", ambientLevel = 30, volumePercent = 70,
                enhancerEnabled = true, enhancerBoostDb = 3.0, enhancerBassDb = -1.5, enhancerTrebleDb = 2.0,
            ),
            session.toEntity().toDomain().playbackConditions(),
        )
    }

    @Test
    fun sessionSnapshotNullsStayNullAndDefaultsComeFromConditions() {
        val session = Session(
            id = "s1", trackId = "t1", contentHash = "h", startedAt = 10,
            stretchId = "s1", createdAt = 10, updatedAt = 20,
        )
        val entity = session.toEntity()
        assertNull(entity.context_title)
        assertNull(entity.collection_sort)
        assertNull(entity.collection_sort_direction)
        assertNull(entity.collection_index)
        assertNull(entity.collection_size)
        assertNull(entity.ambient_tone)
        assertNull(entity.ambient_level)
        assertNull(entity.volume_percent)
        assertNull(entity.enhancer_enabled)
        assertNull(entity.enhancer_boost_db)
        assertNull(entity.enhancer_bass_db)
        assertNull(entity.enhancer_treble_db)

        val restored = entity.toDomain()
        assertNull(restored.volumePercent)
        assertNull(restored.collectionSort)
        assertEquals(PlaybackConditions(), restored.playbackConditions())
    }

    @Test
    fun annotationTagsJsonRoundTrip() {
        val annotation = Annotation(id = "a1", trackId = "t1", contentHash = "h", positionSec = 30, text = "note", tags = listOf("کتاب", "تفسیر"), createdAt = 1, updatedAt = 2)
        val entity = annotation.toEntity()
        assertEquals("[\"کتاب\",\"تفسیر\"]", entity.tags)
        assertEquals(annotation, entity.toDomain())
    }

    @Test
    fun playlistItemsJsonRoundTrip() {
        val playlist = Playlist(id = "p1", title = "P", items = listOf(PlaylistItem("t1", 0), PlaylistItem("t2", 1)), createdAt = 1, updatedAt = 2)
        val entity = playlist.toEntity()
        assertEquals(playlist, entity.toDomain())
    }

    @Test
    fun contextPlayRoundTrip() {
        val run = ContextPlay(id = "c1", contextType = ContextType.Online, contextKey = "src:ext", contextTitle = "Course", trackCount = 10, startedAt = 1, createdAt = 1, updatedAt = 2)
        assertEquals(run, run.toEntity().toDomain())
    }

    @Test
    fun onlineCollectionRoundTrip() {
        val collection = OnlineCollection(key = "src:ext", sourceId = "src", externalId = "ext", title = "C", languageCode = "fa", isFavorite = true, createdAt = 1, updatedAt = 2)
        assertEquals(collection, collection.toEntity().toDomain())
    }

    @Test
    fun downloadJobRoundTrip() {
        val job = DownloadJob(id = "j1", collectionKey = "src:ext", trackId = "t1", externalId = "ext", title = "J", url = "u", destPath = "d", state = DownloadJobState.Running, createdAt = 1, updatedAt = 2, scopeKey = "src:ext")
        assertEquals(job, job.toEntity().toDomain())
    }

    @Test
    fun syncStatusWireMapping() {
        assertEquals("pending", SyncStatus.Pending.wire)
        assertEquals(SyncStatus.Failed, SyncStatus.from("failed"))
        assertEquals(SyncStatus.Pending, SyncStatus.from(null))
        assertEquals(SyncStatus.Pending, SyncStatus.from("nonsense"))
    }
}