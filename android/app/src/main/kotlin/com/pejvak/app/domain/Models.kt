package com.pejvak.app.domain

/**
 * Plain domain models — the canonical shapes the pure logic and repositories use.
 * No Android imports. Room entities (data/local) map to/from these. Positions and
 * durations are integer seconds; timestamps are epoch milliseconds.
 */

enum class SyncStatus(val wire: String) {
    Pending("pending"), Syncing("syncing"), Synced("synced"), Failed("failed");
    companion object { fun from(wire: String?): SyncStatus = entries.firstOrNull { it.wire == wire } ?: Pending }
}

enum class Origin(val wire: String) {
    Local("local"), Online("online");
    companion object { fun from(wire: String?): Origin = entries.firstOrNull { it.wire == wire } ?: Local }
}

enum class Availability(val wire: String) {
    Present("present"), Missing("missing");
    companion object { fun from(wire: String?): Availability = entries.firstOrNull { it.wire == wire } ?: Present }
}

enum class ContextType(val wire: String) {
    Playlist("playlist"), Folder("folder"), Online("online");
    companion object { fun from(wire: String?): ContextType? = entries.firstOrNull { it.wire == wire } }
}

data class Track(
    val id: String,
    val serverId: String? = null,
    val contentHash: String,
    val title: String,
    val fileName: String? = null,
    val fileUri: String? = null,
    val durationSec: Int = 0,
    val fileSizeBytes: Long = 0,
    val mimeType: String? = null,
    val isAudiobook: Boolean = false,
    val author: String? = null,
    val narrator: String? = null,
    val artworkUrl: String? = null,
    val totalPlayCount: Int = 0,
    val totalListenTimeSec: Int = 0,
    val lastPlayedAt: Long? = null,
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
    val source: String? = null,
    val sourceUri: String? = null,
    val sourcePath: String? = null,
    val sourceSize: Long? = null,
    val sourceMtime: Long? = null,
    val folderKey: String? = null,
    val folderName: String? = null,
    val album: String? = null,
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val year: Int? = null,
    val availability: Availability = Availability.Present,
    val artworkCheckedAt: Long? = null,
    val origin: Origin = Origin.Local,
    val streamUrl: String? = null,
    val sourceId: String? = null,
    val externalId: String? = null,
    val collectionKey: String? = null,
    val collectionTitle: String? = null,
    val downloadedAt: Long? = null,
    val downloadPath: String? = null,
)

data class Session(
    val id: String,
    val serverId: String? = null,
    val trackId: String,
    val contentHash: String,
    val startedAt: Long,
    val endedAt: Long? = null,
    val startPositionSec: Int = 0,
    val endPositionSec: Int? = null,
    val durationListenedSec: Int = 0,
    val playbackSpeed: Double = 1.0,
    val completed: Boolean = false,
    val interrupted: Boolean = false,
    val deviceInfo: String? = null,
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
    val contextPlayId: String? = null,
    val contextType: ContextType? = null,
    val contextKey: String? = null,
    val stretchId: String,
    val seeked: Boolean = false,
    val contextTitle: String? = null,
    val collectionSort: CollectionSort? = null,
    val collectionSortDirection: SortDirection? = null,
    val collectionIndex: Int? = null,
    val collectionSize: Int? = null,
    val ambientTone: String? = null,
    val ambientLevel: Int? = null,
    val volumePercent: Int? = null,
    val enhancerEnabled: Boolean? = null,
    val enhancerBoostDb: Double? = null,
    val enhancerBassDb: Double? = null,
    val enhancerTrebleDb: Double? = null,
)

data class Annotation(
    val id: String,
    val serverId: String? = null,
    val trackId: String,
    val contentHash: String,
    val positionSec: Int,
    val text: String,
    val tags: List<String> = emptyList(),
    val color: String? = null,
    val timesPlayedBefore: Int = 0,
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class PlaylistItem(val trackId: String, val order: Int)

data class Playlist(
    val id: String,
    val serverId: String? = null,
    val title: String,
    val description: String? = null,
    val isPublic: Boolean = false,
    val items: List<PlaylistItem> = emptyList(),
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

/** Local-only kill-recovery checkpoint; never synced. */
data class Checkpoint(
    val id: String,
    val sessionId: String,
    val trackId: String,
    val contentHash: String,
    val positionSec: Int,
    val lastPositionSec: Int,
    val durationListenedSec: Int = 0,
    val playbackSpeed: Double = 1.0,
    val startedAt: Long,
    val timestamp: Long,
    val deviceInfo: String? = null,
    val contextPlayId: String? = null,
    val stretchId: String? = null,
)

data class Folder(
    val key: String,
    val name: String,
    val treeUri: String? = null,
    val addedAt: Long,
    val lastPlayedAt: Long? = null,
)

/** One run through a collection (playlist/folder/online). */
data class ContextPlay(
    val id: String,
    val serverId: String? = null,
    val contextType: ContextType,
    val contextKey: String,
    val contextTitle: String,
    val trackCount: Int = 0,
    val startedAt: Long,
    val endedAt: Long? = null,
    val lastIndex: Int = 0,
    val lastTrackId: String? = null,
    val lastPositionSec: Int = 0,
    val listenedSec: Int = 0,
    val finishedCount: Int = 0,
    val completed: Boolean = false,
    val interrupted: Boolean = false,
    val deletedAt: Long? = null,
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
)