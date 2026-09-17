import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import Constants, { ExecutionEnvironment } from "expo-constants";

import type { LocalTrack } from "@/lib/db/types";
import { resumePositionSec } from "@/lib/resume";
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
    artist: track.author,
    artworkUrl: track.artworkUrl,
    contentHash: track.contentHash,
    isAudiobook: track.isAudiobook,
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

/**
 * Start a queue at `index`. The queue is just an ordered list of track ids; the
 * player resolves them lazily so a long library does not need to be hydrated.
 */
export async function playQueueAt(
  trackIds: string[],
  index: number,
  startPositionSec?: number,
): Promise<void> {
  const trackId = trackIds[index];
  if (!trackId) {
    return;
  }
  usePlayerStore.getState().setQueue(trackIds, index);
  // Mark the track as current synchronously so any screen that reads the store
  // immediately after this call (and would otherwise decide to load the track
  // itself) sees the right one.
  patch({ trackId });
  await playTrackById(trackId, startPositionSec);
}

/**
 * Load and play a single track.
 *
 * Without an explicit position this resumes where the listener left off. An
 * explicit one wins — that is how tapping a history entry lands on *that*
 * session's position rather than the most recent one. The position has to reach
 * `loadAndPlay`, which seeks before the first frame; seeking afterwards would
 * briefly play from the wrong place.
 */
async function playTrackById(trackId: string, startPositionSec?: number): Promise<void> {
  const track = await LocalDBService.getTrackById(trackId);
  if (!track) {
    patch({ status: "error", error: "That track is no longer in your library." });
    return;
  }
  const sessions = await LocalDBService.getSessionsByTrack(track.id);
  const start =
    startPositionSec !== undefined
      ? startPositionSec
      : resumePositionSec(sessions, track.durationSec);
  await loadAndPlay(track, start);
}

/**
 * Append tracks to the end of the current queue without touching playback.
 *
 * Deliberately separate from `playQueueAt`, which *replaces* the queue: "add to
 * queue" means the listener is mid-album and wants a lecture after it, not that
 * they want the lecture now. With nothing playing there is no queue to extend,
 * so this becomes an ordinary queue load that still does not auto-play — the
 * mini-player then offers the first added track.
 */
export function enqueue(trackIds: string[]): void {
  if (trackIds.length === 0) {
    return;
  }
  const { queue, queueIndex } = usePlayerStore.getState();
  const appended = [...queue, ...trackIds];
  if (queue.length === 0) {
    usePlayerStore.getState().setQueue(appended, 0);
    return;
  }
  usePlayerStore.getState().setQueue(appended, queueIndex);
}

/**
 * Advance to the next queued track. At the end of the queue we restart the
 * current track rather than wrapping, which is what a listener expects from an
 * audiobook or an album.
 */
export async function next(): Promise<void> {
  const { queue, queueIndex } = usePlayerStore.getState();
  usePlayerStore.getState().signalSkip(1);

  const targetIndex = queueIndex + 1;
  const targetId = queue[targetIndex];
  if (!targetId) {
    await seekTo(0);
    return;
  }
  usePlayerStore.getState().setQueue(queue, targetIndex);
  await playTrackById(targetId);
}

/** Step back a track, or restart the current one if we are at the head. */
export async function previous(): Promise<void> {
  const { queue, queueIndex } = usePlayerStore.getState();
  usePlayerStore.getState().signalSkip(-1);

  const targetIndex = queueIndex - 1;
  const targetId = queue[targetIndex];
  if (!targetId) {
    await seekTo(0);
    return;
  }
  usePlayerStore.getState().setQueue(queue, targetIndex);
  await playTrackById(targetId);
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
