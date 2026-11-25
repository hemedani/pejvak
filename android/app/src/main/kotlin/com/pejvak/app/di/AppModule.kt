package com.pejvak.app.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.room.Room
import com.pejvak.app.BuildConfig
import com.pejvak.app.data.local.PejvakDatabase
import com.pejvak.app.data.local.SettingsDao
import com.pejvak.app.data.remote.LesanClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): PejvakDatabase =
        Room.databaseBuilder(context, PejvakDatabase::class.java, "pejvak.db")
            .addMigrations(com.pejvak.app.data.local.MIGRATION_1_2, com.pejvak.app.data.local.MIGRATION_2_3)
            .build()

    @Provides
    fun provideSettingsDao(db: PejvakDatabase): SettingsDao = db.settingsDao()

    @Provides
    fun provideTrackDao(db: PejvakDatabase): com.pejvak.app.data.local.TrackDao = db.trackDao()

    @Provides
    fun provideSessionDao(db: PejvakDatabase): com.pejvak.app.data.local.SessionDao = db.sessionDao()

    @Provides
    fun provideAnnotationDao(db: PejvakDatabase): com.pejvak.app.data.local.AnnotationDao = db.annotationDao()

    @Provides
    fun providePlaylistDao(db: PejvakDatabase): com.pejvak.app.data.local.PlaylistDao = db.playlistDao()

    @Provides
    fun provideCheckpointDao(db: PejvakDatabase): com.pejvak.app.data.local.CheckpointDao = db.checkpointDao()

    @Provides
    fun provideFolderDao(db: PejvakDatabase): com.pejvak.app.data.local.FolderDao = db.folderDao()

    @Provides
    fun provideContextPlayDao(db: PejvakDatabase): com.pejvak.app.data.local.ContextPlayDao = db.contextPlayDao()

    @Provides
    fun provideOnlineCollectionDao(db: PejvakDatabase): com.pejvak.app.data.local.OnlineCollectionDao = db.onlineCollectionDao()

    @Provides
    fun provideDownloadJobDao(db: PejvakDatabase): com.pejvak.app.data.local.DownloadJobDao = db.downloadJobDao()

    @Provides
    fun provideDownloadScopeDao(db: PejvakDatabase): com.pejvak.app.data.local.DownloadScopeDao = db.downloadScopeDao()

    @Provides
    fun provideDownloadFileDao(db: PejvakDatabase): com.pejvak.app.data.local.DownloadFileDao = db.downloadFileDao()

    @Provides
    fun provideChannelDao(db: PejvakDatabase): com.pejvak.app.data.local.ChannelDao = db.channelDao()

    @Provides
    fun provideChannelPlaylistDao(db: PejvakDatabase): com.pejvak.app.data.local.ChannelPlaylistDao = db.channelPlaylistDao()

    @Provides
    fun provideChannelAudioDao(db: PejvakDatabase): com.pejvak.app.data.local.ChannelAudioDao = db.channelAudioDao()

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun provideHttpClient(json: Json): HttpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    @Provides
    @Singleton
    fun provideLesanClient(http: HttpClient): LesanClient =
        LesanClient(http, BuildConfig.LESAN_BASE_URL)

    @Provides
    @Singleton
    fun provideDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(
            produceFile = { File(context.filesDir, "datastore/pejvak.preferences_pb") },
        )
}