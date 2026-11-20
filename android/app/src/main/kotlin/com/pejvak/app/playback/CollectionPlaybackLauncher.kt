package com.pejvak.app.playback

import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.repository.OnlineCatalogService
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.FolderPlayMode
import com.pejvak.app.domain.FolderPlayOptions
import com.pejvak.app.domain.FolderPlayPlan
import com.pejvak.app.domain.PlaybackConditions
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.buildFolderPlan
import com.pejvak.app.domain.capturedAmbientTone
import com.pejvak.app.domain.folderTrackProgress
import com.pejvak.app.domain.forInheritance
import com.pejvak.app.domain.orderCollectionTracks
import com.pejvak.app.domain.resolveIndex
import com.pejvak.app.domain.resolvePlaybackCollection
import com.pejvak.app.domain.toFolderPlayable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The one place that turns "play this track" into a run. A local track whose
 * folder is a semantic lecture collection, or an online track carrying a
 * collection key, plays its whole collection; anything else stays standalone.
 * No prompt, no dialog: the resolution is a lookup, not a question.
 */
@Singleton
class CollectionPlaybackLauncher @Inject constructor(
    private val engine: PlaybackEngine,
    private val effects: AudioEffectsController,
    private val library: LibraryRepository,
    private val catalog: OnlineCatalogService,
) {

    suspend fun playResolved(
        track: Track,
        positionSec: Int = 0,
        inherit: PlaybackConditions? = null,
        speed: Double? = null,
        fallbackQueue: List<String>? = null,
        fallbackIndex: Int = 0,
        fallbackContext: PlaybackContext? = null,
    ) {
        inherit?.let { applyInheritance(it, speed) }

        val onlineTracks = track.collectionKey
            ?.takeIf { it.isNotBlank() }
            ?.let { catalog.tracksForCollection(it) }
            .orEmpty()
        val folderTracks = track.folderKey
            ?.takeIf { it.isNotBlank() }
            ?.let { library.tracksInFolder(it) }
            .orEmpty()
        val collection = resolvePlaybackCollection(track, folderTracks, onlineTracks, inherit)
        if (collection != null) {
            val found = collection.tracks.any { it.id == track.id }
            val index = resolveIndex(collection.tracks, track.id)
            val entry = collection.tracks[index]
            engine.loadAndPlay(
                entry,
                if (found) positionSec else 0,
                PlaybackContext(collection.type, collection.key, collection.title, collection.sort, collection.direction),
                collection.tracks.map { it.id },
                index,
            )
            return
        }

        val queue = fallbackQueue?.takeIf { it.isNotEmpty() } ?: listOf(track.id)
        val index = if (fallbackQueue != null) fallbackIndex.coerceIn(0, queue.lastIndex) else 0
        engine.loadAndPlay(track, positionSec, fallbackContext, queue, index)
    }

    suspend fun playFolder(
        folderKey: String,
        folderName: String,
        mode: FolderPlayMode = FolderPlayMode.Resume,
        sort: CollectionSort = CollectionSort.Folder,
        direction: SortDirection = SortDirection.Asc,
        startTrackId: String? = null,
        startPositionSec: Int = 0,
        plan: FolderPlayPlan? = null,
    ) {
        val tracks = library.tracksInFolder(folderKey)
        val resolvedPlan = plan ?: buildFolderPlan(
            tracks.map { it.toFolderPlayable() },
            folderTrackProgress(tracks, library.allSessions()),
            FolderPlayOptions(mode, sort, direction),
        )
        val entryIndex = startTrackId?.let { id -> resolvedPlan.queueIds.indexOf(id).takeIf { it >= 0 } }
            ?: resolvedPlan.startIndex
        val entry = tracks.firstOrNull { it.id == resolvedPlan.queueIds.getOrNull(entryIndex) } ?: return
        val shuffle = mode == FolderPlayMode.Shuffle
        engine.loadAndPlay(
            entry,
            if (startTrackId != null) startPositionSec else resolvedPlan.startPositionSec,
            PlaybackContext(
                ContextType.Folder,
                folderKey,
                folderName,
                if (shuffle) CollectionSort.Shuffle else sort,
                if (shuffle) SortDirection.Asc else direction,
            ),
            resolvedPlan.queueIds,
            entryIndex,
        )
    }

    suspend fun playOnline(
        collectionKey: String,
        title: String,
        startTrackId: String? = null,
        startPositionSec: Int = 0,
        sort: CollectionSort = CollectionSort.Source,
        direction: SortDirection = SortDirection.Asc,
        orderedTracks: List<Track>? = null,
    ) {
        val cached = catalog.tracksForCollection(collectionKey)
        val source = orderedTracks?.takeIf { it.isNotEmpty() } ?: cached
        if (source.isEmpty()) return
        // A caller that already shows an order (the collection screen) hands it in
        // whole, so a shuffle cannot land differently in the list and the queue.
        val ordered = if (orderedTracks != null) source else orderCollectionTracks(source, sort, direction)
        val startId = startTrackId ?: ordered.first().id
        val index = resolveIndex(ordered, startId)
        engine.loadAndPlay(
            ordered[index],
            if (ordered[index].id == startId) startPositionSec else 0,
            PlaybackContext(ContextType.Online, collectionKey, title, sort, direction),
            ordered.map { it.id },
            index,
        )
    }

    private suspend fun applyInheritance(conditions: PlaybackConditions, speed: Double?) {
        val inherited = conditions.forInheritance()
        effects.setTone(capturedAmbientTone(inherited.ambientTone, inherited.ambientLevel))
        effects.setToneLevel(inherited.ambientLevel)
        effects.setEnhancer(
            enabled = inherited.enhancerEnabled,
            boostDb = inherited.enhancerBoostDb,
            bassDb = inherited.enhancerBassDb,
            trebleDb = inherited.enhancerTrebleDb,
        )
        effects.setVolume(inherited.volumePercent)
        engine.setVolume(inherited.volumePercent)
        if (speed != null && speed > 0) engine.setSpeed(speed)
    }
}
