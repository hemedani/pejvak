package com.pejvak.app.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One row of the Recent tab: a collection when the session had one, else its track. */
sealed interface RecentPlay {
    val lastPlayedAt: Long

    data class FolderPlay(val folder: com.pejvak.app.domain.Folder, override val lastPlayedAt: Long) : RecentPlay
    data class PlaylistPlay(val playlist: com.pejvak.app.domain.Playlist, override val lastPlayedAt: Long) : RecentPlay
    data class TrackPlay(val track: com.pejvak.app.domain.Track, override val lastPlayedAt: Long) : RecentPlay
}

fun recentPlayKey(play: RecentPlay): String = when (play) {
    is RecentPlay.FolderPlay -> "folder:${play.folder.key}"
    is RecentPlay.PlaylistPlay -> "playlist:${play.playlist.id}"
    is RecentPlay.TrackPlay -> "track:${play.track.id}"
}

/**
 * Collapses newest-first sessions into distinct recent plays. A session in a
 * collection becomes that collection; if the collection is gone, its track is
 * used instead of dropping the listen.
 */
fun buildRecentPlays(
    sessions: List<Session>,
    folders: List<Folder>,
    playlists: List<Playlist>,
    tracks: List<Track>,
    limit: Int,
): List<RecentPlay> {
    val folderByKey = folders.associateBy { it.key }
    val playlistById = playlists.associateBy { it.id }
    val trackById = tracks.associateBy { it.id }
    val seen = HashSet<String>()
    val plays = ArrayList<RecentPlay>()

    for (session in sessions) {
        if (plays.size >= limit) break
        val lastPlayedAt = session.startedAt
        if (session.contextType == ContextType.Folder && session.contextKey != null) {
            val folder = folderByKey[session.contextKey]
            if (folder != null) {
                if (seen.add("folder:${folder.key}")) {
                    plays.add(RecentPlay.FolderPlay(folder, lastPlayedAt))
                }
                continue
            }
        } else if (session.contextType == ContextType.Playlist && session.contextKey != null) {
            val playlist = playlistById[session.contextKey]
            if (playlist != null) {
                if (seen.add("playlist:${playlist.id}")) {
                    plays.add(RecentPlay.PlaylistPlay(playlist, lastPlayedAt))
                }
                continue
            }
        }
        val track = trackById[session.trackId] ?: continue
        if (seen.add("track:${track.id}")) {
            plays.add(RecentPlay.TrackPlay(track, lastPlayedAt))
        }
    }
    return plays
}

fun describeRecentWhen(timestampMs: Long, now: Long = System.currentTimeMillis()): String {
    val deltaSec = (now - timestampMs) / 1000
    if (deltaSec < 60) return "Just now"
    val minutes = deltaSec / 60
    if (minutes < 60) return "${minutes}m ago"
    val hours = minutes / 60
    if (hours < 24) return "${hours}h ago"
    val days = hours / 24
    if (days == 1L) return "Yesterday"
    if (days < 7) return "${days}d ago"
    val formatter = DateTimeFormatter.ofPattern("M/d/yyyy", Locale.US)
    return formatter.format(Instant.ofEpochMilli(timestampMs).atZone(ZoneId.systemDefault()))
}

fun recentSearchFields(play: RecentPlay): List<SearchField> = when (play) {
    is RecentPlay.FolderPlay -> folderSearchFields(play.folder)
    is RecentPlay.PlaylistPlay -> playlistSearchFields(play.playlist)
    is RecentPlay.TrackPlay -> trackSearchFields(play.track)
}
