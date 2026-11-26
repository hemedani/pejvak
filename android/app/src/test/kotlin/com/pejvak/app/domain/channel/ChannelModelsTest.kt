package com.pejvak.app.domain.channel

import com.pejvak.app.domain.Origin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChannelModelsTest {

    @Test
    fun contextKeyIsChannelScoped() {
        assertEquals("channel:abc123", channelContextKey("abc123"))
    }

    @Test
    fun absoluteAudioUrlPassesThrough() {
        val url = "http://46.245.98.207:1405/uploads/channel/audio/x.mp3"
        assertEquals(url, resolveAudioUrl(url, "http://46.245.98.207:1405"))
    }

    @Test
    fun rootRelativeAudioUrlGetsServerOrigin() {
        val resolved = resolveAudioUrl("/uploads/channel/audio/x.mp3", "http://46.245.98.207:1405")
        assertEquals("http://46.245.98.207:1405/uploads/channel/audio/x.mp3", resolved)
    }

    @Test
    fun rootRelativeAudioUrlToleratesTrailingSlashOrigin() {
        val resolved = resolveAudioUrl("/uploads/a.mp3", "http://host:1405/")
        assertEquals("http://host:1405/uploads/a.mp3", resolved)
    }

    @Test
    fun schemeRelativeAudioUrlAdoptsServerScheme() {
        assertEquals("https://cdn/x.mp3", resolveAudioUrl("//cdn/x.mp3", "https://api.host/lesan"))
        assertEquals("http://cdn/x.mp3", resolveAudioUrl("//cdn/x.mp3", "http://api.host/lesan"))
    }

    @Test
    fun serverOriginStripsTheLesanPath() {
        assertEquals("http://46.245.98.207:1405", serverOriginFromBaseUrl("http://46.245.98.207:1405/lesan"))
        assertEquals("https://api.example.com", serverOriginFromBaseUrl("https://api.example.com/lesan"))
        assertEquals("http://host:1405", serverOriginFromBaseUrl("http://host:1405"))
    }

    @Test
    fun materialiseProducesOnlineTrackWithChannelRun() {
        val audio = ChannelAudio(
            serverId = "srv-1",
            channelServerId = "chan-1",
            playlistServerId = "pl-1",
            contentHash = "deadbeef",
            title = "Episode 1",
            audioUrl = "/uploads/channel/audio/e1.mp3",
            durationSec = 90,
            fileSizeBytes = 1234L,
            mimeType = "audio/mpeg",
            cachedAt = 1000L,
        )
        val track = channelAudioToTrack(audio, "My Channel", "http://h:1405", now = 2000L)
        assertEquals(Origin.Online, track.origin)
        assertEquals("http://h:1405/uploads/channel/audio/e1.mp3", track.streamUrl)
        assertEquals(track.streamUrl, track.fileUri)
        assertEquals("deadbeef", track.contentHash)
        // Identity is the hash, so history/notes follow with no second code path.
        assertEquals("deadbeef", track.id)
        assertEquals("channel:chan-1", track.collectionKey)
        assertEquals("My Channel", track.collectionTitle)
        assertEquals(90, track.durationSec)
        assertEquals(1234L, track.fileSizeBytes)
    }

    @Test
    fun publicOnlyWhenActive() {
        val base = Channel(serverId = "c", slug = "c", name = "C", cachedAt = 1L)
        assertTrue(channelIsPublic(base.copy(status = ChannelStatus.Active)))
        assertFalse(channelIsPublic(base.copy(status = ChannelStatus.Removed)))
    }

    @Test
    fun statusFromWireDefaultsActive() {
        assertEquals(ChannelStatus.Removed, ChannelStatus.from("removed"))
        assertEquals(ChannelStatus.Active, ChannelStatus.from("active"))
        assertEquals(ChannelStatus.Active, ChannelStatus.from(null))
        assertEquals(ChannelStatus.Active, ChannelStatus.from("nonsense"))
    }

    @Test
    fun subtitleShowsCreatorAndCount() {
        val withBoth = Channel(serverId = "c", slug = "c", name = "C", creatorDisplayName = "Ada", audioCount = 3, cachedAt = 1L)
        assertEquals("Ada · 3 audios", channelSubtitle(withBoth))
        val usernameOnly = Channel(serverId = "c", slug = "c", name = "C", creatorUsername = "ada", cachedAt = 1L)
        assertEquals("@ada", channelSubtitle(usernameOnly))
        val empty = Channel(serverId = "c", slug = "c", name = "C", cachedAt = 1L)
        assertNull(channelSubtitle(empty))
    }

    @Test
    fun channelDraftRequiresNameAndAtLeastOneCategory() {
        assertFalse(ChannelDraft(name = "", categories = listOf("a")).isValid)
        assertFalse(ChannelDraft(name = "Night Signals", categories = emptyList()).isValid)
        assertTrue(ChannelDraft(name = "Night Signals", categories = listOf("podcast")).isValid)
    }

    @Test
    fun channelDraftToChannelTrimsAndDropsBlanks() {
        val draft = ChannelDraft(
            name = "  Night Signals  ",
            bio = "   ",
            categories = listOf("podcast"),
            donationUrl = "  ",
            socials = listOf(ChannelSocial("mastodon", "   "), ChannelSocial("x", "https://x.com/n")),
        )
        val channel = draft.toChannel(existing = null, cachedAt = 5L, isMine = true)
        assertEquals("Night Signals", channel.name)
        assertNull(channel.bio)
        assertNull(channel.donationUrl)
        assertEquals(1, channel.socials.size)
        assertEquals("https://x.com/n", channel.socials.first().url)
        assertTrue(channel.isMine)
        assertEquals(5L, channel.cachedAt)
    }

    @Test
    fun channelDraftRoundTripsFromChannel() {
        val channel = Channel(
            serverId = "c", slug = "s", name = "C", bio = "hi", categories = listOf("a", "b"),
            donationUrl = "d", contactEmail = "e@x.com", cachedAt = 1L,
        )
        val draft = ChannelDraft.from(channel)
        assertEquals("C", draft.name)
        assertEquals("hi", draft.bio)
        assertEquals(listOf("a", "b"), draft.categories)
        assertEquals("d", draft.donationUrl)
        assertEquals("e@x.com", draft.contactEmail)
    }

    @Test
    fun folderAndEpisodeDraftsRequireTitleAndCategory() {
        assertFalse(PlaylistDraft(title = "Season 1", category = "").isValid)
        assertTrue(PlaylistDraft(title = "Season 1", category = "podcast").isValid)
        assertFalse(EpisodeDraft(title = "", category = "podcast").isValid)
        assertTrue(EpisodeDraft(title = "Ep 1", category = "podcast").isValid)
    }

    @Test
    fun parseTagListSplitsTrimsAndDedupes() {
        assertEquals(listOf("a", "b", "c"), parseTagList(" a , b ,\n c, a "))
        assertEquals(emptyList<String>(), parseTagList("   "))
    }

    @Test
    fun downloadFileNameKeysOnHashWithMimeExtension() {
        assertEquals("abc123.mp3", channelDownloadFileName("abc123", "audio/mpeg"))
        assertEquals("abc123.m4a", channelDownloadFileName("abc123", "audio/mp4"))
        assertEquals("abc123.ogg", channelDownloadFileName("abc123", "audio/ogg"))
        assertEquals("abc123.mp3", channelDownloadFileName("abc123", null))
        // Non-alphanumeric hash characters are stripped so the leaf name is filesystem-safe.
        assertEquals("abcd.mp3", channelDownloadFileName("a-b/c:d", "audio/mpeg"))
    }

    @Test
    fun materialisePrefersLocalFileWhenDownloaded() {
        val audio = ChannelAudio(
            serverId = "srv-1", channelServerId = "chan-1", contentHash = "deadbeef",
            title = "Ep", audioUrl = "/uploads/channel/audio/e1.mp3", durationSec = 90, cachedAt = 1000L,
        )
        val streamed = channelAudioToTrack(audio, "Chan", "http://h:1405", now = 2000L)
        assertEquals("http://h:1405/uploads/channel/audio/e1.mp3", streamed.fileUri)
        org.junit.Assert.assertNull(streamed.downloadPath)

        val offline = channelAudioToTrack(audio, "Chan", "http://h:1405", localFileUri = "file:///data/Channels/deadbeef.mp3", now = 2000L)
        assertEquals("file:///data/Channels/deadbeef.mp3", offline.fileUri)
        assertEquals("file:///data/Channels/deadbeef.mp3", offline.downloadPath)
        assertEquals(com.pejvak.app.domain.Availability.Present, offline.availability)
        // The stream URL stays on the row so deleting the download falls back to streaming.
        assertEquals("http://h:1405/uploads/channel/audio/e1.mp3", offline.streamUrl)
    }
}
