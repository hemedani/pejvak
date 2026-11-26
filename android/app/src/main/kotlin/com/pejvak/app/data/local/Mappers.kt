package com.pejvak.app.data.local

import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.Availability
import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.DownloadFile
import com.pejvak.app.domain.DownloadJob
import com.pejvak.app.domain.DownloadJobState
import com.pejvak.app.domain.DownloadScope
import com.pejvak.app.domain.DownloadScopeKind
import com.pejvak.app.domain.DownloadState
import com.pejvak.app.domain.Folder
import com.pejvak.app.domain.OnlineCollection
import com.pejvak.app.domain.Origin
import com.pejvak.app.domain.Playlist
import com.pejvak.app.domain.PlaylistItem
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.SyncStatus
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.ChannelSocial
import com.pejvak.app.domain.channel.ChannelStatus
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Entity ↔ domain mappers. JSON columns (tags, playlist items) are decoded here. */
private val mapperJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

@Serializable
private data class ItemJson(val trackId: String, val order: Int)

@Serializable
private data class SocialJson(val platform: String, val url: String)

private fun encodeStringList(values: List<String>): String = mapperJson.encodeToString(values)

private fun decodeStringList(raw: String?): List<String> =
    if (raw.isNullOrBlank()) emptyList() else runCatching { mapperJson.decodeFromString<List<String>>(raw) }.getOrDefault(emptyList())

private fun encodeSocials(values: List<ChannelSocial>): String =
    mapperJson.encodeToString(values.map { SocialJson(it.platform, it.url) })

private fun decodeSocials(raw: String?): List<ChannelSocial> =
    if (raw.isNullOrBlank()) emptyList() else runCatching {
        mapperJson.decodeFromString<List<SocialJson>>(raw).map { ChannelSocial(it.platform, it.url) }
    }.getOrDefault(emptyList())

// --- Track ---
fun TrackEntity.toDomain() = Track(
    id = id, serverId = server_id, contentHash = content_hash, title = title,
    fileName = file_name, fileUri = file_uri, durationSec = duration_sec, fileSizeBytes = file_size_bytes,
    mimeType = mime_type, isAudiobook = is_audiobook, author = author, narrator = narrator,
    artworkUrl = artwork_url, totalPlayCount = total_play_count, totalListenTimeSec = total_listen_time_sec,
    lastPlayedAt = last_played_at, syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at,
    source = source, sourceUri = source_uri, sourcePath = source_path, sourceSize = source_size, sourceMtime = source_mtime,
    folderKey = folder_key, folderName = folder_name, album = album, trackNumber = track_number, discNumber = disc_number,
    year = year, availability = Availability.from(availability), artworkCheckedAt = artwork_checked_at,
    origin = Origin.from(origin), streamUrl = stream_url, sourceId = source_id, externalId = external_id,
    collectionKey = collection_key, collectionTitle = collection_title, downloadedAt = downloaded_at, downloadPath = download_path,
)

fun Track.toEntity() = TrackEntity(
    id = id, server_id = serverId, content_hash = contentHash, title = title,
    file_name = fileName, file_uri = fileUri, duration_sec = durationSec, file_size_bytes = fileSizeBytes,
    mime_type = mimeType, is_audiobook = isAudiobook, author = author, narrator = narrator,
    artwork_url = artworkUrl, total_play_count = totalPlayCount, total_listen_time_sec = totalListenTimeSec,
    last_played_at = lastPlayedAt, sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt,
    source = source, source_uri = sourceUri, source_path = sourcePath, source_size = sourceSize, source_mtime = sourceMtime,
    folder_key = folderKey, folder_name = folderName, album = album, track_number = trackNumber, disc_number = discNumber,
    year = year, availability = availability.wire, artwork_checked_at = artworkCheckedAt,
    origin = origin.wire, stream_url = streamUrl, source_id = sourceId, external_id = externalId,
    collection_key = collectionKey, collection_title = collectionTitle, downloaded_at = downloadedAt, download_path = downloadPath,
)

// --- Session ---
fun SessionEntity.toDomain() = Session(
    id = id, serverId = server_id, trackId = track_id, contentHash = content_hash,
    startedAt = started_at, endedAt = ended_at, startPositionSec = start_position_sec, endPositionSec = end_position_sec,
    durationListenedSec = duration_listened_sec, playbackSpeed = playback_speed, completed = completed, interrupted = interrupted,
    deviceInfo = device_info, syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at,
    deletedAt = deleted_at, contextPlayId = context_play_id, contextType = ContextType.from(context_type), contextKey = context_key,
    stretchId = stretch_id, seeked = seeked,
    contextTitle = context_title, collectionSort = CollectionSort.from(collection_sort),
    collectionSortDirection = SortDirection.from(collection_sort_direction),
    collectionIndex = collection_index, collectionSize = collection_size, ambientTone = ambient_tone,
    ambientLevel = ambient_level, volumePercent = volume_percent, enhancerEnabled = enhancer_enabled,
    enhancerBoostDb = enhancer_boost_db, enhancerBassDb = enhancer_bass_db, enhancerTrebleDb = enhancer_treble_db,
)

fun Session.toEntity() = SessionEntity(
    id = id, server_id = serverId, track_id = trackId, content_hash = contentHash,
    started_at = startedAt, ended_at = endedAt, start_position_sec = startPositionSec, end_position_sec = endPositionSec,
    duration_listened_sec = durationListenedSec, playback_speed = playbackSpeed, completed = completed, interrupted = interrupted,
    device_info = deviceInfo, sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt,
    deleted_at = deletedAt, context_play_id = contextPlayId, context_type = contextType?.wire, context_key = contextKey,
    stretch_id = stretchId, seeked = seeked,
    context_title = contextTitle, collection_sort = collectionSort?.wire,
    collection_sort_direction = collectionSortDirection?.wire, collection_index = collectionIndex,
    collection_size = collectionSize, ambient_tone = ambientTone, ambient_level = ambientLevel,
    volume_percent = volumePercent, enhancer_enabled = enhancerEnabled, enhancer_boost_db = enhancerBoostDb,
    enhancer_bass_db = enhancerBassDb, enhancer_treble_db = enhancerTrebleDb,
)

// --- Annotation ---
fun AnnotationEntity.toDomain() = Annotation(
    id = id, serverId = server_id, trackId = track_id, contentHash = content_hash,
    positionSec = position_sec, text = text, tags = mapperJson.decodeFromString<List<String>>(tags), color = color,
    timesPlayedBefore = times_played_before, syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at, deletedAt = deleted_at,
)

fun Annotation.toEntity() = AnnotationEntity(
    id = id, server_id = serverId, track_id = trackId, content_hash = contentHash,
    position_sec = positionSec, text = text, tags = mapperJson.encodeToString(tags), color = color,
    times_played_before = timesPlayedBefore, sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt, deleted_at = deletedAt,
)

// --- Playlist ---
fun PlaylistEntity.toDomain() = Playlist(
    id = id, serverId = server_id, title = title, description = description, isPublic = is_public,
    items = mapperJson.decodeFromString<List<ItemJson>>(items).map { PlaylistItem(it.trackId, it.order) },
    syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at, deletedAt = deleted_at,
)

fun Playlist.toEntity() = PlaylistEntity(
    id = id, server_id = serverId, title = title, description = description, is_public = isPublic,
    items = mapperJson.encodeToString(items.map { ItemJson(it.trackId, it.order) }),
    sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt, deleted_at = deletedAt,
)

// --- Checkpoint ---
fun CheckpointEntity.toDomain() = Checkpoint(
    id = id, sessionId = session_id, trackId = track_id, contentHash = content_hash,
    positionSec = position_sec, lastPositionSec = last_position_sec, durationListenedSec = duration_listened_sec,
    playbackSpeed = playback_speed, startedAt = started_at, timestamp = timestamp, deviceInfo = device_info,
    contextPlayId = context_play_id, stretchId = stretch_id,
)

fun Checkpoint.toEntity() = CheckpointEntity(
    id = id, session_id = sessionId, track_id = trackId, content_hash = contentHash,
    position_sec = positionSec, last_position_sec = lastPositionSec, duration_listened_sec = durationListenedSec,
    playback_speed = playbackSpeed, started_at = startedAt, timestamp = timestamp, device_info = deviceInfo,
    context_play_id = contextPlayId, stretch_id = stretchId,
)

// --- Folder ---
fun FolderEntity.toDomain() = Folder(key = key, name = name, treeUri = tree_uri, addedAt = added_at, lastPlayedAt = last_played_at)
fun Folder.toEntity() = FolderEntity(key = key, name = name, tree_uri = treeUri, added_at = addedAt, last_played_at = lastPlayedAt)

// --- ContextPlay ---
fun ContextPlayEntity.toDomain() = ContextPlay(
    id = id, serverId = server_id, contextType = ContextType.from(context_type) ?: ContextType.Playlist,
    contextKey = context_key, contextTitle = context_title, trackCount = track_count, startedAt = started_at, endedAt = ended_at,
    lastIndex = last_index, lastTrackId = last_track_id, lastPositionSec = last_position_sec, listenedSec = listened_sec,
    finishedCount = finished_count, completed = completed, interrupted = interrupted, deletedAt = deleted_at,
    syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at,
)

fun ContextPlay.toEntity() = ContextPlayEntity(
    id = id, server_id = serverId, context_type = contextType.wire, context_key = contextKey, context_title = contextTitle,
    track_count = trackCount, started_at = startedAt, ended_at = endedAt, last_index = lastIndex, last_track_id = lastTrackId,
    last_position_sec = lastPositionSec, listened_sec = listenedSec, finished_count = finishedCount, completed = completed,
    interrupted = interrupted, deleted_at = deletedAt, sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt,
)

// --- OnlineCollection ---
fun OnlineCollectionEntity.toDomain() = OnlineCollection(
    key = key, serverId = server_id, sourceId = source_id, externalId = external_id, title = title, subtitle = subtitle,
    artworkUrl = artwork_url, languageCode = language_code, trackCount = track_count, pageUrl = page_url, isFavorite = is_favorite,
    lastOpenedAt = last_opened_at, downloadState = DownloadState.from(download_state), deletedAt = deleted_at,
    syncStatus = SyncStatus.from(sync_status), createdAt = created_at, updatedAt = updated_at,
)

fun OnlineCollection.toEntity() = OnlineCollectionEntity(
    key = key, server_id = serverId, source_id = sourceId, external_id = externalId, title = title, subtitle = subtitle,
    artwork_url = artworkUrl, language_code = languageCode, track_count = trackCount, page_url = pageUrl, is_favorite = isFavorite,
    last_opened_at = lastOpenedAt, download_state = downloadState.wire, deleted_at = deletedAt,
    sync_status = syncStatus.wire, created_at = createdAt, updated_at = updatedAt,
)

// --- DownloadJob ---
fun DownloadJobEntity.toDomain() = DownloadJob(
    id = id, collectionKey = collection_key, trackId = track_id, externalId = external_id, title = title, orderIndex = order_index,
    url = url, destPath = dest_path, state = DownloadJobState.from(state), bytesTotal = bytes_total, bytesDone = bytes_done,
    attempts = attempts, error = error, createdAt = created_at, updatedAt = updated_at, scopeKey = scope_key,
)

fun DownloadJob.toEntity() = DownloadJobEntity(
    id = id, collection_key = collectionKey, track_id = trackId, external_id = externalId, title = title, order_index = orderIndex,
    url = url, dest_path = destPath, state = state.wire, bytes_total = bytesTotal, bytes_done = bytesDone,
    attempts = attempts, error = error, created_at = createdAt, updated_at = updatedAt, scope_key = scopeKey,
)

// --- DownloadScope ---
fun DownloadScopeEntity.toDomain() = DownloadScope(
    key = key, collectionKey = collection_key, kind = DownloadScopeKind.from(kind), title = title, seriesKey = series_key,
    downloadState = DownloadState.from(download_state), createdAt = created_at, updatedAt = updated_at,
)

fun DownloadScope.toEntity() = DownloadScopeEntity(
    key = key, collection_key = collectionKey, kind = kind.wire, title = title, series_key = seriesKey,
    download_state = downloadState.wire, created_at = createdAt, updated_at = updatedAt,
)

// --- DownloadFile ---
fun DownloadFileEntity.toDomain() = DownloadFile(
    scopeKey = scope_key, scopeKind = DownloadScopeKind.from(scope_kind), trackId = track_id, fileUri = file_uri, filePath = file_path,
    fileSizeBytes = file_size_bytes, durationSec = duration_sec, folderKey = folder_key, folderName = folder_name,
    trackNumber = track_number, createdAt = created_at,
)

fun DownloadFile.toEntity() = DownloadFileEntity(
    scope_key = scopeKey, scope_kind = scopeKind.wire, track_id = trackId, file_uri = fileUri, file_path = filePath,
    file_size_bytes = fileSizeBytes, duration_sec = durationSec, folder_key = folderKey, folder_name = folderName,
    track_number = trackNumber, created_at = createdAt,
)

// --- Channel (read-cache mirror; no sync columns) ---
fun ChannelEntity.toDomain() = Channel(
    serverId = serverId, slug = slug, name = name, bio = bio, categories = decodeStringList(categories),
    languageCode = languageCode, avatarUrl = avatarUrl, gallery = decodeStringList(gallery),
    donationUrl = donationUrl, websiteUrl = websiteUrl, socials = decodeSocials(socials), contactEmail = contactEmail,
    status = ChannelStatus.from(status), audioCount = audioCount, playlistCount = playlistCount,
    creatorId = creatorId, creatorUsername = creatorUsername, creatorDisplayName = creatorDisplayName,
    creatorAvatarUrl = creatorAvatarUrl, isMine = isMine, cachedAt = cachedAt, createdAt = createdAt, updatedAt = updatedAt,
)

fun Channel.toEntity() = ChannelEntity(
    serverId = serverId, slug = slug, name = name, bio = bio, categories = encodeStringList(categories),
    languageCode = languageCode, avatarUrl = avatarUrl, gallery = encodeStringList(gallery),
    donationUrl = donationUrl, websiteUrl = websiteUrl, socials = encodeSocials(socials), contactEmail = contactEmail,
    status = status.wire, audioCount = audioCount, playlistCount = playlistCount,
    creatorId = creatorId, creatorUsername = creatorUsername, creatorDisplayName = creatorDisplayName,
    creatorAvatarUrl = creatorAvatarUrl, isMine = isMine, cachedAt = cachedAt, createdAt = createdAt, updatedAt = updatedAt,
)

fun ChannelPlaylistEntity.toDomain() = ChannelPlaylist(
    serverId = serverId, channelServerId = channelServerId, title = title, description = description,
    category = category, tags = decodeStringList(tags), sortOrder = sortOrder, audioCount = audioCount,
    isMine = isMine, cachedAt = cachedAt,
)

fun ChannelPlaylist.toEntity() = ChannelPlaylistEntity(
    serverId = serverId, channelServerId = channelServerId, title = title, description = description,
    category = category, tags = encodeStringList(tags), sortOrder = sortOrder, audioCount = audioCount,
    isMine = isMine, cachedAt = cachedAt,
)

fun ChannelAudioEntity.toDomain() = ChannelAudio(
    serverId = serverId, channelServerId = channelServerId, playlistServerId = playlistServerId,
    contentHash = contentHash, title = title, description = description, category = category,
    tags = decodeStringList(tags), audioUrl = audioUrl, durationSec = durationSec, fileSizeBytes = fileSizeBytes,
    mimeType = mimeType, isAudiobook = isAudiobook, author = author, narrator = narrator, artworkUrl = artworkUrl,
    position = position, languageCode = languageCode, status = ChannelStatus.from(status),
    downloadState = DownloadState.from(downloadState), localPath = localPath, isMine = isMine, cachedAt = cachedAt,
)

fun ChannelAudio.toEntity() = ChannelAudioEntity(
    serverId = serverId, channelServerId = channelServerId, playlistServerId = playlistServerId,
    contentHash = contentHash, title = title, description = description, category = category,
    tags = encodeStringList(tags), audioUrl = audioUrl, durationSec = durationSec, fileSizeBytes = fileSizeBytes,
    mimeType = mimeType, isAudiobook = isAudiobook, author = author, narrator = narrator, artworkUrl = artworkUrl,
    position = position, languageCode = languageCode, status = status.wire, downloadState = downloadState.wire,
    localPath = localPath, isMine = isMine, cachedAt = cachedAt,
)