/**
 * Closing the now-playing bar.
 *
 * The bar's close button is the one control that *ends* rather than pauses, so
 * the cases here are about what it must not do: it must not let the listen it
 * interrupted count as a completed play, and it must not leave the store saying
 * "playing" with nothing behind it.
 *
 * `TrackPlayerService` keeps the player, the live session and the open run in
 * module scope, so `beforeEach` drops them — the same leak the other player
 * suites guard against.
 */

import type { AudioStatus } from "expo-audio";

import type { LocalContextPlay, LocalSession, LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { usePlayerStore } from "@/store/playerStore";
import * as TrackPlayerService from "@/services/TrackPlayerService";

jest.mock("expo-audio", () => {
  // Created inside the factory on purpose: a `const` in this file would still be
  // in its temporal dead zone when the hoisted `jest.mock` factories run.
  const listeners: ((status: unknown) => void)[] = [];
  const release = jest.fn();
  return {
    __listeners: listeners,
    __release: release,
    createAudioPlayer: jest.fn(() => ({
      addListener: jest.fn((_event: string, listener: (status: unknown) => void) => {
        listeners.push(listener);
      }),
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      release,
      seekTo: jest.fn(() => Promise.resolve()),
      setPlaybackRate: jest.fn(),
      setActiveForLockScreen: jest.fn(),
      currentTime: 0,
      playing: false,
    })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "bare" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getOpenContextPlays: jest.fn(),
    insertContextPlay: jest.fn(),
    finalizeContextPlay: jest.fn(),
    touchContextPlay: jest.fn(),
    getTrackById: jest.fn(),
    getSessionsByTrack: jest.fn(),
    insertSession: jest.fn(),
    saveCheckpoint: jest.fn(),
    finalizeSession: jest.fn(),
    deleteCheckpoint: jest.fn(),
    setTrackAvailability: jest.fn(),
    newStretchId: jest.fn(),
    markSessionSeeked: jest.fn(),
  },
}));

jest.mock("@/services/SyncService", () => ({
  syncPending: jest.fn(() => Promise.resolve({})),
}));

jest.mock("@/services/FileLocationService", () => ({
  isLocationReachable: jest.fn(() => Promise.resolve(true)),
}));

const audioMock = jest.requireMock("expo-audio") as {
  __listeners: ((status: AudioStatus) => void)[];
  __release: jest.Mock;
  createAudioPlayer: jest.Mock;
};

const db = jest.mocked(LocalDBService);

/** The status listener the most recently built player registered. */
function listener(): (status: AudioStatus) => void {
  const registered = audioMock.__listeners[audioMock.__listeners.length - 1];
  if (!registered) {
    throw new Error("no status listener registered — did playback ever start?");
  }
  return registered;
}

function tick(overrides: Partial<AudioStatus> = {}): AudioStatus {
  return {
    currentTime: 0,
    duration: 600,
    isLoaded: true,
    playing: false,
    didJustFinish: false,
    playbackRate: 1,
    ...overrides,
  } as AudioStatus;
}

/** Lets the fire-and-forget work inside `handleStatus` settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function track(id: string): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: id,
    fileName: `${id}.mp3`,
    fileUri: `file:///${id}.mp3`,
    durationSec: 600,
    fileSizeBytes: 0,
    mimeType: null,
    isAudiobook: true,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    source: "saf",
    sourceUri: `content:///${id}.mp3`,
    sourcePath: `/storage/${id}.mp3`,
    sourceSize: null,
    sourceMtime: null,
    folderKey: "Lectures",
    folderName: "Lectures",
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
  };
}

function session(): LocalSession {
  return {
    id: "sess-1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-t1",
    startedAt: 0,
    endedAt: null,
    startPositionSec: 0,
    endPositionSec: null,
    durationListenedSec: 0,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: "sess-1",
    seeked: false,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

function run(overrides: Partial<LocalContextPlay> = {}): LocalContextPlay {
  return {
    id: "run-open",
    serverId: null,
    contextType: "folder",
    contextKey: "Lectures",
    contextTitle: "Lectures",
    trackCount: 2,
    startedAt: 0,
    endedAt: null,
    lastIndex: 0,
    lastTrackId: null,
    lastPositionSec: 0,
    listenedSec: 0,
    finishedCount: 0,
    completed: false,
    interrupted: false,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const lectures = { type: "folder" as const, key: "Lectures", title: "Lectures" };

/** Starts a two-track folder play and opens the first session. */
async function playFolder(): Promise<void> {
  await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
  listener()(tick({ playing: true, currentTime: 5 }));
  await settle();
  expect(db.insertSession).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  jest.clearAllMocks();

  TrackPlayerService.__resetForTests();
  usePlayerStore.getState().reset();

  let minted = 0;
  db.newStretchId.mockImplementation(() => {
    minted += 1;
    return `stretch-${minted}`;
  });

  const tracks = [track("t1"), track("t2")];
  db.getTrackById.mockImplementation(async (id) =>
    tracks.find((item) => item.id === id) ?? null,
  );
  db.getSessionsByTrack.mockResolvedValue([]);
  db.getOpenContextPlays.mockResolvedValue([]);
  db.insertContextPlay.mockResolvedValue(run());
  db.insertSession.mockResolvedValue(session());
  db.finalizeContextPlay.mockResolvedValue(undefined);
  db.finalizeSession.mockResolvedValue(undefined);
  db.saveCheckpoint.mockResolvedValue(undefined);
  db.deleteCheckpoint.mockResolvedValue(undefined);
  db.touchContextPlay.mockResolvedValue(undefined);
  db.markSessionSeeked.mockResolvedValue(undefined);
});

describe("stopping from the mini-player", () => {
  it("ends the live session as interrupted, never as completed", async () => {
    await playFolder();

    await TrackPlayerService.stop();

    expect(db.finalizeSession).toHaveBeenCalledTimes(1);
    const [sessionId, options] = db.finalizeSession.mock.calls[0];
    expect(sessionId).toBe("sess-1");
    expect(options).toMatchObject({ completed: false, interrupted: true });
  });

  it("closes the open run as interrupted, so an abandoned folder is not a play", async () => {
    await playFolder();

    await TrackPlayerService.stop();

    expect(db.finalizeContextPlay).toHaveBeenCalledTimes(1);
    const [runId, options] = db.finalizeContextPlay.mock.calls[0];
    expect(runId).toBe("run-open");
    expect(options).toMatchObject({ completed: false, interrupted: true });
  });

  it("returns the store to idle, which is what unmounts the bar", async () => {
    await playFolder();
    expect(usePlayerStore.getState().trackId).toBe("t1");
    expect(usePlayerStore.getState().context).toEqual(lectures);

    await TrackPlayerService.stop();

    const state = usePlayerStore.getState();
    expect(state.status).toBe("idle");
    expect(state.trackId).toBeNull();
    expect(state.title).toBeNull();
    expect(state.context).toBeNull();
    expect(state.queue).toEqual([]);
    expect(state.queueIndex).toBe(-1);
  });

  it("releases the player and forgets it, so the next play builds a fresh one", async () => {
    await playFolder();
    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(1);

    await TrackPlayerService.stop();

    expect(audioMock.__release).toHaveBeenCalledTimes(1);

    await TrackPlayerService.playQueueAt(["t1"], 0, 0, lectures);
    await settle();

    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it("ignores a status tick that arrives after the release", async () => {
    await playFolder();
    // Held before the stop, because `stop()` is what forgets the player and a
    // real release can still deliver one final update through this listener.
    const late = listener();

    await TrackPlayerService.stop();
    late(tick({ playing: true, currentTime: 42 }));
    await settle();

    expect(usePlayerStore.getState().status).toBe("idle");
    expect(usePlayerStore.getState().trackId).toBeNull();
    // No second session: the tick must not restart the listen that just ended.
    expect(db.insertSession).toHaveBeenCalledTimes(1);
  });

  it("does nothing when nothing is playing", async () => {
    await expect(TrackPlayerService.stop()).resolves.toBeUndefined();

    expect(db.finalizeSession).not.toHaveBeenCalled();
    expect(db.finalizeContextPlay).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe("idle");
  });
});
