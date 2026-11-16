package com.pejvak.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.pejvak.app.data.auth.AuthSession
import com.pejvak.app.data.download.DownloadService
import com.pejvak.app.data.sync.SyncScheduler
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * Application entry point. Hilt owns the dependency graph; WorkManager is
 * initialized through Hilt's worker factory (the default initializer is removed
 * in the manifest) so sync workers can inject repositories.
 *
 * Sync triggers that are not tied to a screen live here: the periodic baseline
 * and "connectivity regained". A screen's own foreground/action triggers call the
 * scheduler directly.
 */
@HiltAndroidApp
class PejvakApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var syncScheduler: SyncScheduler

    @Inject
    lateinit var authSession: AuthSession

    @Inject
    lateinit var downloadService: DownloadService

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        syncScheduler.schedulePeriodic()
        observeConnectivity()
        downloadService.resumeInterrupted()
    }

    /** Reconnected: push queued rows now instead of waiting for the next timer. */
    private fun observeConnectivity() {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (authSession.current() != null) syncScheduler.syncNow()
            }
        }
        try {
            manager.registerDefaultNetworkCallback(callback)
        } catch (_: Exception) {
            // A missing callback is not fatal: the periodic baseline still retries.
        }
    }
}
