package com.pejvak.app.data.repository

import com.pejvak.app.data.local.CheckpointDao
import com.pejvak.app.data.local.ContextPlayDao
import com.pejvak.app.data.local.SessionDao
import com.pejvak.app.data.local.TrackDao
import com.pejvak.app.data.local.toDomain
import com.pejvak.app.data.local.toEntity
import com.pejvak.app.domain.Checkpoint
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.Session
import com.pejvak.app.domain.Track
import com.pejvak.app.playback.PlaybackStore
import javax.inject.Inject
import javax.inject.Singleton

/** Room-backed [PlaybackStore]. Local-first; sync is a separate concern (Phase 5). */
@Singleton
class RoomPlaybackStore @Inject constructor(
    private val trackDao: TrackDao,
    private val sessionDao: SessionDao,
    private val checkpointDao: CheckpointDao,
    private val contextPlayDao: ContextPlayDao,
) : PlaybackStore {

    override suspend fun getTrack(id: String): Track? = trackDao.getById(id)?.toDomain()
    override suspend fun setTrackDuration(id: String, durationSec: Int) = trackDao.setDuration(id, durationSec)
    override suspend fun setTrackAvailability(id: String, availability: String) = trackDao.setAvailability(id, availability)

    override suspend fun insertSession(session: Session) = sessionDao.upsert(session.toEntity())
    override suspend fun getSession(id: String): Session? = sessionDao.getById(id)?.toDomain()
    override suspend fun finalizeSession(id: String, endedAt: Long, endPositionSec: Int, durationListenedSec: Int, completed: Boolean, interrupted: Boolean) =
        sessionDao.finalize(id, endedAt, endPositionSec, durationListenedSec, completed, interrupted)
    override suspend fun markSessionSeeked(id: String) = sessionDao.markSeeked(id)

    override suspend fun saveCheckpoint(checkpoint: Checkpoint) = checkpointDao.upsert(checkpoint.toEntity())
    override suspend fun deleteCheckpoint(sessionId: String) = checkpointDao.deleteBySession(sessionId)
    override suspend fun getOrphanedCheckpoints(): List<Checkpoint> = checkpointDao.getOrphaned().map { it.toDomain() }

    override suspend fun getOpenRuns(): List<ContextPlay> = contextPlayDao.getOpen().map { it.toDomain() }
    override suspend fun getRun(id: String): ContextPlay? = contextPlayDao.getById(id)?.toDomain()
    override suspend fun insertRun(run: ContextPlay) = contextPlayDao.upsert(run.toEntity())
    override suspend fun finalizeRun(id: String, endedAt: Long, completed: Boolean, interrupted: Boolean) =
        contextPlayDao.finalize(id, endedAt, completed, interrupted)
    override suspend fun touchRun(id: String, lastIndex: Int, lastTrackId: String?, lastPositionSec: Int, listenedSec: Int, finishedCount: Int, at: Long) =
        contextPlayDao.touch(id, lastIndex, lastTrackId, lastPositionSec, listenedSec, finishedCount, at)
}