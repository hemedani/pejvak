import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import Constants, { ExecutionEnvironment } from "expo-constants";

import type { LocalTrack } from "@/lib/db/types";
import {
  applyProgress,
  createSessionTracker,
  type SessionTrackerState,
} from "@/lib/sessionTracking";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";
import { usePlayerStore, type PlayerPatch } from "@/store/playerStore";
import { useSettingsStore } from "@/store/settingsStore";

type ActiveSession = {
  track: LocalTrack;
  sessionId: string;
  tracker: SessionTrackerState;
  deviceInfo: string | null;
};

/**
 * Expo Go has no audio foreground service (the config-plugin-generated
 * `AudioControlsService` only exists in a development/production build), so
 * lock-screen/background features are unavailable there.
 */
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let player: AudioPlayer | null = null;
let currentTrack: LocalTrack | null = null;
let active: ActiveSession | null = null;
let sessionStarting = false;
let wasPlaying = false;
let configured = false;
let lockScreenFailed = IS_EXPO_GO;
let pendingSeekSec: number | null = null;
let nextSessionStartSec = 0;

function patch(partial: PlayerPatch) {
  usePlayerStore.getState().patch(partial);
}

function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: 1000 });
    player.addListener("playbackStatusUpdate", handleStatus);
  }
  return player;
}

/** Configure background playback once. Safe to call repeatedly. */
export async function configureAudio(): Promise<void> {
  if (configured) {
    return;
  }
  configured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: !IS_EXPO_GO,
      interruptionMode: "doNotMix",
    });
  } catch {
    // Best-effort: Expo Go has no background audio service, and playback still
    // works in the foreground.
  }
}

async function beginSession(
  track: LocalTrack,
  startPositionSec: number,
  playbackSpeed: number,
): Promise<void> {
  if (active || sessionStarting) {
    return;
  }
  sessionStarting = true;
  try {
    const startedAt = Date.now();
    const session = await LocalDBService.insertSession({
      trackId: track.id,
      contentHash: track.contentHash,
      startedAt,
      startPositionSec,
      playbackSpeed,
    });
    active = {
      track,
      sessionId: session.id,
      tracker: createSessionTracker({
        sessionId: session.id,
        startedAtMs: startedAt,
        startPositionSec,
        playbackSpeed,
      }),
      deviceInfo: null,
    };
  } finally {
    sessionStarting = false;
  }
}

async function writeCheckpoint(): Promise<void> {
  if (!active) {
    return;
  }
  await LocalDBService.saveCheckpoint({
    sessionId: active.sessionId,
    trackId: active.track.id,
    contentHash: active.track.contentHash,
    positionSec: active.tracker.lastPositionSec,
    lastPositionSec: active.tracker.lastPositionSec,
    durationListenedSec: active.tracker.durationListenedSec,
    playbackSpeed: active.tracker.playbackSpeed,
    startedAt: active.tracker.startedAtMs,
    timestamp: Date.now(),
    deviceInfo: active.deviceInfo,
  });
}

async function finishSession(options: {
  completed: boolean;
  interrupted: boolean;
}): Promise<void> {
  const session = active;
  if (!session) {
    return;
  }
  active = null;
  await LocalDBService.finalizeSession(session.sessionId, {
    endedAt: Date.now(),
    endPositionSec: Math.round(session.tracker.lastPositionSec),
    durationListenedSec: Math.round(session.tracker.durationListenedSec),
    completed: options.completed,
    interrupted: options.interrupted,
  });
  await LocalDBService.deleteCheckpoint(session.sessionId);
  patch({ status: options.completed ? "ended" : "paused" });
  void syncPending().catch(() => undefined);
}

function handleStatus(status: AudioStatus): void {
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const current = usePlayerStore.getState();
  patch({
    positionSec: Math.floor(currentTime),
    durationSec: status.duration > 0 ? Math.floor(status.duration) : current.durationSec,
  });

  if (status.error) {
    patch({ status: "error", error: status.error });
    return;
  }

  if (pendingSeekSec !== null && status.isLoaded) {
    const target = pendingSeekSec;
    pendingSeekSec = null;
    void player?.seekTo(target).catch(() => undefined);
  }

  if (status.didJustFinish) {
    wasPlaying = false;
    void finishSession({ completed: true, interrupted: false });
    return;
  }

  if (status.playing) {
    patch({ status: "playing" });
    if (!active && currentTrack && !sessionStarting) {
      const speed = status.playbackRate || 1;
      const start = nextSessionStartSec > 0 ? nextSessionStartSec : currentTime;
      nextSessionStartSec = 0;
      void beginSession(currentTrack, start, speed);
    }
    if (active) {
      const result = applyProgress(active.tracker, {
        positionSec: currentTime,
        atMs: Date.now(),
      });
      active.tracker = result.state;
      if (result.checkpointDue) {
        void writeCheckpoint();
      }
    }
  } else if (wasPlaying) {
    void finishSession({ completed: false, interrupted: false });
  }

  wasPlaying = status.playing;
}

export async function loadAndPlay(track: LocalTrack, startPositionSec = 0): Promise<void> {
  if (!track.fileUri) {
    patch({ status: "error", error: "This track has no local audio file." });
    return;
  }

  await configureAudio();
  await finishSession({ completed: false, interrupted: true });

  currentTrack = track;
  nextSessionStartSec = Math.round(startPositionSec);
  pendingSeekSec = startPositionSec > 0 ? startPositionSec : null;

  const defaultSpeed = useSettingsStore.getState().defaultSpeed;

  patch({
    status: "loading",
    trackId: track.id,
    title: track.title,
    positionSec: Math.floor(startPositionSec),
    durationSec: track.durationSec,
    playbackSpeed: defaultSpeed,
    error: null,
  });

  const instance = getPlayer();
  instance.replace({ uri: track.fileUri });
  instance.setPlaybackRate(defaultSpeed);
  if (!lockScreenFailed) {
    try {
      instance.setActiveForLockScreen(
        true,
        {
          title: track.title,
          artist: track.author ?? undefined,
          albumTitle: track.isAudiobook ? "Audiobook" : "Music",
          artworkUrl: track.artworkUrl ?? undefined,
        },
        { showSeekBackward: true, showSeekForward: true },
      );
    } catch {
      // Expo Go has no audio foreground service; playback still works.
      lockScreenFailed = true;
    }
  }
  instance.play();
}

export function pause(): void {
  player?.pause();
}

export function resume(): void {
  void configureAudio();
  player?.play();
}

export function togglePlayPause(): void {
  const instance = player;
  if (!instance) {
    return;
  }
  if (instance.playing) {
    instance.pause();
  } else {
    void configureAudio().then(() => instance.play());
  }
}

export async function seekTo(positionSec: number): Promise<void> {
  const instance = getPlayer();
  await instance.seekTo(positionSec);
  if (active) {
    active.tracker = applyProgress(active.tracker, {
      positionSec,
      atMs: Date.now(),
    }).state;
  }
  patch({ positionSec: Math.floor(positionSec) });
}

/** A speed change ends the current session and (if playing) starts a new one. */
export async function setPlaybackRate(rate: number): Promise<void> {
  const instance = getPlayer();
  const wasPlayingNow = instance.playing;
  if (active) {
    await finishSession({ completed: false, interrupted: false });
  }
  instance.setPlaybackRate(rate);
  patch({ playbackSpeed: rate });
  if (wasPlayingNow) {
    nextSessionStartSec = Math.round(instance.currentTime);
    instance.play();
  }
}

/** Clean up any checkpoint whose session was killed before it ended. */
export async function recoverOrphanedSessions(): Promise<number> {
  const checkpoints = await LocalDBService.getOrphanedCheckpoints();
  for (const checkpoint of checkpoints) {
    let existing = await LocalDBService.getSessionById(checkpoint.sessionId);
    if (!existing) {
      await LocalDBService.insertSession({
        id: checkpoint.sessionId,
        trackId: checkpoint.trackId,
        contentHash: checkpoint.contentHash,
        startedAt: checkpoint.startedAt,
        startPositionSec: checkpoint.positionSec,
        playbackSpeed: checkpoint.playbackSpeed,
      });
      existing = await LocalDBService.getSessionById(checkpoint.sessionId);
    }
    if (existing && existing.endedAt === null) {
      await LocalDBService.finalizeSession(checkpoint.sessionId, {
        endedAt: checkpoint.timestamp,
        endPositionSec: checkpoint.positionSec,
        durationListenedSec: checkpoint.durationListenedSec,
        completed: false,
        interrupted: true,
      });
    }
    await LocalDBService.deleteCheckpoint(checkpoint.sessionId);
  }
  return checkpoints.length;
}
