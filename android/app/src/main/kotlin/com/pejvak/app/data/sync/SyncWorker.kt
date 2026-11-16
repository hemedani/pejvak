package com.pejvak.app.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pejvak.app.data.auth.AuthSession
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Background sync worker. Pushes pending rows then pulls server state. A failure
 * returns retry so WorkManager backs off; the app stays fully usable offline.
 * Without a session there is nothing the server may accept, so it exits quietly.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val syncRepository: SyncRepository,
    private val authSession: AuthSession,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (authSession.current() == null) return Result.success()
        return try {
            syncRepository.syncAll()
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}