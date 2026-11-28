package com.pejvak.app.data.local

import android.content.Context
import androidx.room.withTransaction
import com.pejvak.app.data.auth.SecureTokenStore
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The one place that can wipe everything this install has stored on-device (plan 09 UX-07):
 * the Room tables (history, notes, library, playlists, runs, online mirror, channel mirror,
 * settings) and the downloaded media files. Used only by an explicit, opt-in sign-out erase —
 * never by a plain sign-out, which keeps the device's data for the next sign-in.
 */
@Singleton
class LocalDataStore @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val db: PejvakDatabase,
    private val tokenStore: SecureTokenStore,
) {
    /**
     * Clears every table and the on-disk downloads, then the durable token. Returns after the
     * data is gone. Best-effort on the file sweep (a locked file must not abort the DB wipe).
     */
    suspend fun eraseAll() {
        db.withTransaction { db.clearAllTables() }
        withContext(Dispatchers.IO) {
            runCatching { File(appContext.filesDir, "Channels").deleteRecursively() }
            runCatching { File(appContext.filesDir, "Downloads").deleteRecursively() }
        }
        tokenStore.clearToken()
    }
}
