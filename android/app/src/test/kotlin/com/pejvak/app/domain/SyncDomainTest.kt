package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsTest {
    @Test
    fun `normalize falls back per field`() {
        val s = normalizeSharedSettings(languageCode = "  ", defaultSpeed = 99.0, historySort = "bogus", updatedAt = -5)
        assertNull(s.languageCode)
        assertEquals(1.0, s.defaultSpeed, 0.0001)
        assertEquals(HistorySort.Newest, s.historySort)
        assertEquals(0L, s.updatedAt)
    }

    @Test
    fun `normalize keeps valid values`() {
        val s = normalizeSharedSettings(languageCode = "fa", defaultSpeed = 1.5, historySort = "oldest", updatedAt = 123)
        assertEquals("fa", s.languageCode)
        assertEquals(1.5, s.defaultSpeed, 0.0001)
        assertEquals(HistorySort.Oldest, s.historySort)
        assertEquals(123L, s.updatedAt)
    }

    @Test
    fun `speed bounds`() {
        assertEquals(1.0, parseDefaultSpeed("0.4"), 0.0001)
        assertEquals(1.0, parseDefaultSpeed("3.1"), 0.0001)
        assertEquals(0.5, parseDefaultSpeed("0.5"), 0.0001)
        assertEquals(3.0, parseDefaultSpeed("3"), 0.0001)
        assertEquals(1.0, parseDefaultSpeed(null), 0.0001)
    }

    @Test
    fun `boolean parsing`() {
        assertTrue(parseBoolean("true", false))
        assertFalse(parseBoolean("false", true))
        assertTrue(parseBoolean("junk", true))
    }

    @Test
    fun `formatBytes`() {
        assertEquals("512 B", formatBytes(512))
        assertEquals("1.5 KB", formatBytes(1536))
        assertEquals("1.0 MB", formatBytes(1024 * 1024))
        assertEquals("1.0 GB", formatBytes(1024L * 1024 * 1024))
        assertEquals("0 B", formatBytes(-1))
    }
}

class SyncRetryTest {
    @Test
    fun `base interval after success`() {
        assertEquals(BASE_SYNC_INTERVAL_MS, retryDelayMs(0))
        assertEquals(BASE_SYNC_INTERVAL_MS, retryDelayMs(-1))
    }

    @Test
    fun `exponential backoff capped`() {
        assertEquals(BASE_SYNC_INTERVAL_MS * 2, retryDelayMs(1))
        // BASE * 2^2 = 1_200_000 exceeds MAX, so it caps (RN parity).
        assertEquals(MAX_SYNC_INTERVAL_MS, retryDelayMs(2))
        assertEquals(MAX_SYNC_INTERVAL_MS, retryDelayMs(3))
        assertEquals(MAX_SYNC_INTERVAL_MS, retryDelayMs(10))
    }
}

class ReconcileTest {
    private fun track(id: String, hash: String, serverId: String? = null, origin: Origin = Origin.Local) =
        Track(id = id, contentHash = hash, title = "T", createdAt = 0, updatedAt = 0, serverId = serverId, origin = origin)

    private fun remoteTrack(serverId: String, hash: String, origin: Origin = Origin.Local) =
        RemoteTrack(serverId, hash, "T", 0, 0, false, null, null, origin)

    @Test
    fun `tracks insert backfill and origin repair`() {
        val local = listOf(
            track("a", "h1"),                       // needs backfill
            track("b", "h2", serverId = "s2"),      // already synced, same origin
            track("c", "h3", serverId = "s3", origin = Origin.Local), // origin mismatch
        )
        val remote = listOf(
            remoteTrack("s1", "h1"),
            remoteTrack("s2", "h2"),
            remoteTrack("s3", "h3", Origin.Online),
            remoteTrack("s4", "h4"),                // new
        )
        val result = reconcileTracks(local, remote)
        assertEquals(listOf("h4"), result.inserts.map { it.contentHash })
        assertEquals(listOf(Backfill("a", "s1")), result.backfill)
        assertEquals(listOf(OriginRepair("c", Origin.Online)), result.originRepairs)
    }

    @Test
    fun `online identity is repaired on a row pulled without it`() {
        val local = listOf(track("c", "h3", serverId = "s3", origin = Origin.Online))
        val remote = listOf(
            RemoteTrack(
                "s3", "h3", "T", 0, 0, true, null, null, Origin.Online,
                sourceId = "librivox", externalId = "123", collectionKey = "librivox:9",
                collectionTitle = "A Book",
            ),
        )
        val result = reconcileTracks(local, remote)
        assertEquals(
            listOf(OnlineIdentityRepair("c", "librivox", "123", "librivox:9", "A Book", null)),
            result.onlineIdentityRepairs,
        )
    }

    @Test
    fun `sessions dedupe by clientId`() {
        val local = listOf(
            Session("s1", trackId = "t", contentHash = "h", startedAt = 0, createdAt = 0, updatedAt = 0, stretchId = "st"),
        )
        val remote = listOf(
            RemoteSession("srv1", "s1", "h", 0, 10, 0, 10, 10, 1.0, false, false, null, null, null, null, false),
            RemoteSession("srv2", "s2", "h", 0, 10, 0, 10, 10, 1.0, false, false, null, null, null, null, false),
        )
        val result = reconcileSessions(local, remote)
        assertEquals(listOf("s2"), result.inserts.map { it.clientId })
        assertEquals(listOf(Backfill("s1", "srv1")), result.backfill)
    }

    @Test
    fun `annotation tombstone never resurrected`() {
        val local = listOf(
            Annotation("a1", trackId = "t", contentHash = "h", positionSec = 0, text = "old", createdAt = 0, updatedAt = 100, deletedAt = 500),
        )
        val remote = listOf(RemoteAnnotation("srv", "a1", "h", 0, "new", emptyList(), null, updatedAt = 999))
        val result = reconcileAnnotations(local, remote)
        assertTrue(result.inserts.isEmpty())
        assertTrue(result.updates.isEmpty())
        assertTrue(result.backfill.isEmpty())
    }

    @Test
    fun `annotation last write wins`() {
        val local = listOf(
            Annotation("a1", trackId = "t", contentHash = "h", positionSec = 0, text = "old", createdAt = 0, updatedAt = 100),
            Annotation("a2", trackId = "t", contentHash = "h", positionSec = 0, text = "newer", createdAt = 0, updatedAt = 900),
        )
        val remote = listOf(
            RemoteAnnotation("srv1", "a1", "h", 0, "new", emptyList(), null, updatedAt = 200),
            RemoteAnnotation("srv2", "a2", "h", 0, "older", emptyList(), null, updatedAt = 300),
        )
        val result = reconcileAnnotations(local, remote)
        assertEquals(listOf("a1"), result.updates.map { it.id })
        assertEquals(listOf(Backfill("a2", "srv2")), result.backfill)
    }

    @Test
    fun `online collections dedupe by derived key`() {
        val local = listOf(
            OnlineCollection("src:ext", sourceId = "src", externalId = "ext", title = "T", languageCode = "fa", createdAt = 0, updatedAt = 100),
        )
        val remote = listOf(
            // No clientId — key derived from source ids must still match.
            RemoteOnlineCollection("srv", null, "src", "ext", "T2", null, null, "fa", 0, null, false, null, updatedAt = 200),
        )
        val result = reconcileOnlineCollections(local, remote)
        assertTrue(result.inserts.isEmpty())
        assertEquals(listOf("src:ext"), result.updates.map { it.id })
    }

    @Test
    fun `playlist tombstone never resurrected`() {
        val local = listOf(
            Playlist("p1", title = "P", createdAt = 0, updatedAt = 100, deletedAt = 500),
        )
        val remote = listOf(RemotePlaylist("srv", "p1", "P2", null, false, emptyList(), updatedAt = 999))
        val result = reconcilePlaylists(local, remote)
        assertTrue(result.inserts.isEmpty())
        assertTrue(result.updates.isEmpty())
    }
}