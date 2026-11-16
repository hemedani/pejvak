package com.pejvak.app.di

import com.pejvak.app.data.repository.RoomPlaybackStore
import com.pejvak.app.playback.ExoPlayerCommand
import com.pejvak.app.playback.PlaybackEngine
import com.pejvak.app.playback.PlaybackStore
import com.pejvak.app.playback.PlayerCommand
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class PlaybackBindings {
    @Binds
    @Singleton
    abstract fun bindPlaybackStore(impl: RoomPlaybackStore): PlaybackStore

    @Binds
    @Singleton
    abstract fun bindPlayerCommand(impl: ExoPlayerCommand): PlayerCommand
}

@Module
@InstallIn(SingletonComponent::class)
object PlaybackModule {
    /** The engine is a singleton shared by the service and the UI. Tests construct
     *  it directly with a fake clock/store/command. */
    @Provides
    @Singleton
    fun providePlaybackEngine(store: PlaybackStore, command: PlayerCommand): PlaybackEngine =
        PlaybackEngine(store, command)
}