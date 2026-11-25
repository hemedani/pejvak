package com.pejvak.app.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The 15-table database opens and a KV write survives a read (device smoke). */
class RoomSmokeTest {

    private lateinit var db: PejvakDatabase

    @Before
    fun setUp() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, PejvakDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun everyTableIsCreatedAndSettingsRoundTrip() = runBlocking {
        val names = db.openHelper.readableDatabase
            .query("SELECT name FROM sqlite_master WHERE type = 'table'")
            .use { cursor ->
                buildList { while (cursor.moveToNext()) add(cursor.getString(0)) }
            }
        listOf(
            "tracks", "sessions", "annotations", "playlists", "playback_checkpoints", "settings",
            "folders", "context_plays", "online_collections", "download_jobs",
            "download_scopes", "download_files",
            "channels", "channel_playlists", "channel_audios",
        ).forEach { assertTrue("missing table $it (got $names)", it in names) }

        db.settingsDao().put(SettingsEntity("themePreference", "dark"))
        assertEquals("dark", db.settingsDao().get("themePreference"))
    }
}
