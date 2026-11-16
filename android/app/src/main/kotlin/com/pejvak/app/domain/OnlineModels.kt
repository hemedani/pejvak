package com.pejvak.app.domain

enum class DownloadState(val wire: String) {
    None("none"), Downloading("downloading"), Complete("complete"), Failed("failed"), Cancelled("cancelled");
    companion object { fun from(wire: String?): DownloadState = entries.firstOrNull { it.wire == wire } ?: None }
}

enum class DownloadJobState(val wire: String) {
    Queued("queued"), Running("running"), Done("done"), Failed("failed"), Cancelled("cancelled");
    companion object { fun from(wire: String?): DownloadJobState = entries.firstOrNull { it.wire == wire } ?: Queued }
}

enum class DownloadScopeKind(val wire: String) {
    Collection("collection"), Series("series");
    companion object { fun from(wire: String?): DownloadScopeKind = entries.firstOrNull { it.wire == wire } ?: Collection }
}

/** A saved online collection. `key` = sourceId:externalId (also a run's context_key). */
data class OnlineCollection(
    val key: String,
    val serverId: String? = null,
    val sourceId: String,
    val externalId: String,
    val title: String,
    val subtitle: String? = null,
    val artworkUrl: String? = null,
    val languageCode: String,
    val trackCount: Int = 0,
    val pageUrl: String? = null,
    val isFavorite: Boolean = false,
    val lastOpenedAt: Long? = null,
    val downloadState: DownloadState = DownloadState.None,
    val deletedAt: Long? = null,
    val syncStatus: SyncStatus = SyncStatus.Pending,
    val createdAt: Long,
    val updatedAt: Long,
)

/** One download job per track — the queue is rows, not memory. */
data class DownloadJob(
    val id: String,
    val collectionKey: String,
    val trackId: String,
    val externalId: String,
    val title: String,
    val orderIndex: Int = 0,
    val url: String,
    val destPath: String,
    val state: DownloadJobState = DownloadJobState.Queued,
    val bytesTotal: Long = 0,
    val bytesDone: Long = 0,
    val attempts: Int = 0,
    val error: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val scopeKey: String? = null,
)

/** Series-only download state (collections keep state on OnlineCollection.downloadState). */
data class DownloadScope(
    val key: String,
    val collectionKey: String,
    val kind: DownloadScopeKind,
    val title: String,
    val seriesKey: String? = null,
    val downloadState: DownloadState = DownloadState.None,
    val createdAt: Long,
    val updatedAt: Long,
)

/** Per-scope copy of a downloaded track. PK (scopeKey, trackId). */
data class DownloadFile(
    val scopeKey: String,
    val scopeKind: DownloadScopeKind,
    val trackId: String,
    val fileUri: String,
    val filePath: String,
    val fileSizeBytes: Long = 0,
    val durationSec: Int = 0,
    val folderKey: String,
    val folderName: String,
    val trackNumber: Int = 0,
    val createdAt: Long,
)