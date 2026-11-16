package com.pejvak.app.domain

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Push-engine contract with in-memory fakes: id mapping, idempotent batching,
 * tombstone hard-delete on ack, failure keeps rows queued, playlist deferral.
 */
class SyncEngineTest {

    private class FakeStore : SyncStore {
        val tracks = mutableListOf<Track>()
        val sessions = mutableListOf<Session>()
        val annotations = mutableListOf<Annotation>()
        val playlists = mutableListOf<Playlist>()
        val runs = mutableListOf<ContextPlay>()
        val collections = mutableListOf<OnlineCollection>()
        var sharedSettings: SharedSettings? = null
        var settingsSyncedAt: Long? = null
        var appliedRemote: SharedSettings? = null
        val removedAnnotations = mutableListOf<String>()
        val removedPlaylists = mutableListOf<String>()
        val removedCollections = mutableListOf<String>()

        override suspend fun getPendingTracks(limit: Int) = tracks.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)
        override suspend fun getAllTracks() = tracks.toList()
        override suspend fun getPendingSessions(limit: Int) = sessions.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)
        override suspend fun getPendingAnnotations(limit: Int) = annotations.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)
        override suspend fun getPendingPlaylists(limit: Int) = playlists.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)
        override suspend fun getPendingContextPlays(limit: Int) = runs.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)
        override suspend fun getPendingOnlineCollections(limit: Int) = collections.filter { it.syncStatus == SyncStatus.Pending || it.syncStatus == SyncStatus.Failed }.take(limit)

        override suspend fun setTrackSyncStatus(id: String, status: SyncStatus, serverId: String?) {
            val i = tracks.indexOfFirst { it.id == id }; tracks[i] = tracks[i].copy(syncStatus = status, serverId = serverId ?: tracks[i].serverId)
        }
        override suspend fun setSessionSyncStatus(id: String, status: SyncStatus, serverId: String?) {
            val i = sessions.indexOfFirst { it.id == id }; sessions[i] = sessions[i].copy(syncStatus = status, serverId = serverId ?: sessions[i].serverId)
        }
        override suspend fun setAnnotationSyncStatus(id: String, status: SyncStatus, serverId: String?) {
            val i = annotations.indexOfFirst { it.id == id }; annotations[i] = annotations[i].copy(syncStatus = status, serverId = serverId ?: annotations[i].serverId)
        }
        override suspend fun setPlaylistSyncStatus(id: String, status: SyncStatus, serverId: String?) {
            val i = playlists.indexOfFirst { it.id == id }; playlists[i] = playlists[i].copy(syncStatus = status, serverId = serverId ?: playlists[i].serverId)
        }
        override suspend fun setContextPlaySyncStatus(id: String, status: SyncStatus, serverId: String?) {
            val i = runs.indexOfFirst { it.id == id }; runs[i] = runs[i].copy(syncStatus = status, serverId = serverId ?: runs[i].serverId)
        }
        override suspend fun setOnlineCollectionSyncStatus(key: String, status: SyncStatus, serverId: String?) {
            val i = collections.indexOfFirst { it.key == key }; collections[i] = collections[i].copy(syncStatus = status, serverId = serverId ?: collections[i].serverId)
        }
        override suspend fun removeAnnotation(id: String) { removedAnnotations.add(id); annotations.removeAll { it.id == id } }
        override suspend fun removePlaylist(id: String) { removedPlaylists.add(id); playlists.removeAll { it.id == id } }
        override suspend fun removeOnlineCollection(key: String) { removedCollections.add(key); collections.removeAll { it.key == key } }
        override suspend fun getSharedSettings() = sharedSettings
        override suspend fun markSettingsSynced(updatedAt: Long) { settingsSyncedAt = updatedAt }
        override suspend fun applyRemoteSettings(settings: SharedSettings, expectedUpdatedAt: Long?): Boolean { appliedRemote = settings; return true }
    }

    private class FakeTransport : SyncTransport {
        var failRegister = false
        var failBatch = false
        var registerCalls = 0
        var batchCalls = 0
        var lastSessions = emptyList<Session>()
        var lastPlaylists = emptyList<PlaylistSyncPayload>()
        var lastSettings: SharedSettings? = null
        var resultSettings: SharedSettings? = null
        var resultQuota: HistoryQuota? = null

        override suspend fun registerTrack(track: Track): RegisterTrackResult {
            registerCalls++
            if (failRegister) throw RuntimeException("offline")
            return RegisterTrackResult("srv-${track.id}")
        }

        override suspend fun syncLocalData(
            sessions: List<Session>, annotations: List<Annotation>, playlists: List<PlaylistSyncPayload>,
            contextPlays: List<ContextPlaySyncPayload>, onlineCollections: List<OnlineCollectionSyncPayload>, settings: SharedSettings?,
        ): SyncLocalDataResult {
            batchCalls++
            lastSessions = sessions; lastPlaylists = playlists; lastSettings = settings
            if (failBatch) throw RuntimeException("offline")
            return SyncLocalDataResult(
                syncedSessions = sessions.size,
                syncedAnnotations = annotations.size,
                syncedPlaylists = playlists.size,
                syncedContextPlays = contextPlays.size,
                syncedOnlineCollections = onlineCollections.size,
                annotations = annotations.map { IdMapping(it.id, "srv-${it.id}") },
                playlists = playlists.map { IdMapping(it.clientId, "srv-${it.clientId}") },
                contextPlays = contextPlays.map { IdMapping(it.clientId, "srv-${it.clientId}") },
                onlineCollections = onlineCollections.map { IdMapping(it.clientId, "srv-${it.clientId}") },
                settings = resultSettings,
                historyQuota = resultQuota,
            )
        }
    }

    private fun track(id: String, hash: String, status: SyncStatus = SyncStatus.Pending) =
        Track(id = id, contentHash = hash, title = "T", createdAt = 0, updatedAt = 0, syncStatus = status)

    private fun session(id: String, hash: String, endedAt: Long? = 100) =
        Session(id = id, trackId = "t", contentHash = hash, startedAt = 0, endedAt = endedAt, createdAt = 0, updatedAt = 0, stretchId = "st")

    @Test
    fun `registers tracks then syncs sessions with id mapping`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1"))
        store.sessions.add(session("s1", "h1"))
        val transport = FakeTransport()

        val summary = runSync(store, transport)

        assertEquals(1, summary.tracksRegistered)
        assertEquals(1, summary.sessionsSynced)
        assertEquals(0, summary.failed)
        assertEquals(SyncStatus.Synced, store.tracks[0].syncStatus)
        assertEquals("srv-t1", store.tracks[0].serverId)
        assertEquals(SyncStatus.Synced, store.sessions[0].syncStatus)
    }

    @Test
    fun `open sessions are not sent`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Synced))
        store.sessions.add(session("s1", "h1", endedAt = null))
        val transport = FakeTransport()
        runSync(store, transport)
        assertTrue(transport.lastSessions.isEmpty())
    }

    @Test
    fun `sessions whose track is not synced are deferred`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Pending))
        store.sessions.add(session("s1", "h1"))
        val transport = FakeTransport()
        transport.failRegister = true
        runSync(store, transport)
        // Track failed to register, so its session must not be sent.
        assertTrue(transport.lastSessions.isEmpty())
        assertEquals(SyncStatus.Failed, store.tracks[0].syncStatus)
    }

    @Test
    fun `batch failure keeps rows failed and queued`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Synced))
        store.sessions.add(session("s1", "h1"))
        val transport = FakeTransport()
        transport.failBatch = true
        val summary = runSync(store, transport)
        assertEquals(1, summary.failed)
        assertEquals(SyncStatus.Failed, store.sessions[0].syncStatus)
        // A retry picks the failed row up again.
        assertEquals(1, store.getPendingSessions(50).size)
    }

    @Test
    fun `acknowledged annotation tombstone is hard deleted`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Synced))
        store.annotations.add(
            Annotation("a1", trackId = "t", contentHash = "h1", positionSec = 0, text = "x", createdAt = 0, updatedAt = 0, deletedAt = 50),
        )
        val transport = FakeTransport()
        runSync(store, transport)
        assertEquals(listOf("a1"), store.removedAnnotations)
        assertTrue(store.annotations.isEmpty())
    }

    @Test
    fun `playlist deferred until its tracks are registered`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Pending))
        store.playlists.add(Playlist("p1", title = "P", items = listOf(PlaylistItem("t1", 0)), createdAt = 0, updatedAt = 0))
        val transport = FakeTransport()
        runSync(store, transport)
        // Track registered this run, so the playlist resolves and is sent.
        assertEquals(1, transport.lastPlaylists.size)
        assertEquals(listOf(PlaylistHashItem("h1", 0)), transport.lastPlaylists[0].items)
    }

    @Test
    fun `playlist with unregistered track is not sent`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Pending))
        store.playlists.add(Playlist("p1", title = "P", items = listOf(PlaylistItem("t1", 0)), createdAt = 0, updatedAt = 0))
        val transport = FakeTransport()
        transport.failRegister = true
        runSync(store, transport)
        assertTrue(transport.lastPlaylists.isEmpty())
        assertEquals(SyncStatus.Pending, store.playlists[0].syncStatus)
    }

    @Test
    fun `settings only push is acknowledged`() = runTest {
        val store = FakeStore()
        store.sharedSettings = SharedSettings("fa", 1.0, HistorySort.Newest, updatedAt = 42)
        val transport = FakeTransport()
        runSync(store, transport)
        assertEquals(1, transport.batchCalls)
        assertEquals(42L, store.settingsSyncedAt)
    }

    @Test
    fun `nothing to send makes no batch call`() = runTest {
        val store = FakeStore()
        val transport = FakeTransport()
        val summary = runSync(store, transport)
        assertEquals(0, transport.batchCalls)
        assertEquals(0, summary.failed)
    }

    @Test
    fun `collection tombstone sent as deletion then removed`() = runTest {
        val store = FakeStore()
        store.collections.add(
            OnlineCollection("src:ext", sourceId = "src", externalId = "ext", title = "T", languageCode = "fa", createdAt = 0, updatedAt = 0, deletedAt = 9),
        )
        val transport = FakeTransport()
        runSync(store, transport)
        assertEquals(listOf("src:ext"), store.removedCollections)
    }

    @Test
    fun `remote settings snapshot applied on push response`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Synced))
        store.sessions.add(session("s1", "h1"))
        val transport = FakeTransport()
        transport.resultSettings = SharedSettings("en", 1.25, HistorySort.Oldest, updatedAt = 99)
        runSync(store, transport)
        assertEquals("en", store.appliedRemote?.languageCode)
    }

    @Test
    fun `history quota is carried into the summary`() = runTest {
        val store = FakeStore()
        store.tracks.add(track("t1", "h1", SyncStatus.Synced))
        store.sessions.add(session("s1", "h1"))
        val transport = FakeTransport()
        transport.resultQuota = HistoryQuota(limit = 500, used = 501, remaining = 0, unlimited = false)

        val summary = runSync(store, transport)

        assertEquals(500, summary.historyQuota?.limit)
        assertEquals(501, summary.historyQuota?.used)
    }
}