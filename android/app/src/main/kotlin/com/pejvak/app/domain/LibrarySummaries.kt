package com.pejvak.app.domain

/** A folder as the Library card needs it: the row plus what its tracks add up to. */
data class FolderSummary(
    val folder: Folder,
    val trackCount: Int,
    val finishedCount: Int,
    val totalDurationSec: Int,
    val playCount: Int,
    val completedPlayCount: Int,
)

/** A playlist as a card needs it, without resolving every track on the list. */
data class PlaylistSummary(
    val playlist: Playlist,
    val trackCount: Int,
    val totalDurationSec: Int,
)

/** Per-track progress for folder playback and folder rows. */
fun folderTrackProgress(
    tracks: List<Track>,
    sessions: List<Session>,
): Map<String, FolderTrackProgress> {
    val byTrack = sessions.groupBy { it.trackId }
    return tracks.associate { track ->
        val trackSessions = byTrack[track.id].orEmpty()
        val lastEnded = trackSessions
            .filter { it.endedAt != null }
            .maxByOrNull { it.startedAt }
        track.id to FolderTrackProgress(
            finished = trackSessions.any { it.completed },
            resumeSec = lastEnded?.endPositionSec ?: 0,
        )
    }
}

fun buildFolderSummaries(
    tracks: List<Track>,
    folders: List<Folder>,
    sessions: List<Session>,
    runs: List<ContextPlay>,
): List<FolderSummary> {
    val folderByKey = folders.associateBy { it.key }
    val finished = sessions.filter { it.completed }.mapTo(HashSet()) { it.trackId }
    return tracks
        .filter { it.origin != Origin.Online && it.folderKey != null }
        .groupBy { it.folderKey!! }
        .map { (key, group) ->
            val folder = folderByKey[key] ?: Folder(
                key = key,
                name = group.firstOrNull()?.folderName ?: key,
                addedAt = group.minOfOrNull { it.createdAt } ?: 0,
            )
            val folderRuns = runs.filter { it.contextType == ContextType.Folder && it.contextKey == key }
            FolderSummary(
                folder = folder,
                trackCount = group.size,
                finishedCount = group.count { it.id in finished },
                totalDurationSec = group.sumOf { it.durationSec },
                playCount = folderRuns.size,
                completedPlayCount = folderRuns.count { it.completed },
            )
        }
        .sortedBy { it.folder.name.lowercase() }
}

fun buildPlaylistSummaries(
    playlists: List<Playlist>,
    tracks: List<Track>,
): List<PlaylistSummary> {
    val byId = tracks.associateBy { it.id }
    return playlists.map { playlist ->
        PlaylistSummary(
            playlist = playlist,
            trackCount = playlist.items.size,
            totalDurationSec = playlist.items.sumOf { byId[it.trackId]?.durationSec ?: 0 },
        )
    }
}
