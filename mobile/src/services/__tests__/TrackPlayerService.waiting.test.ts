/**
 * The wait, as the player reports it.
 *
 * The subtlety this file exists for: `playing` cannot answer "is audio here?".
 * ExoPlayer reports `false` for the whole of a stream's first buffer — the
 * player is loading, not playing — and reports `true` again the moment playback
 * stalls mid-track, because it still *wants* to play. So the service has to own
 * the intent itself, and `isBuffering` only says how far along the fetch is.
 */

import type { AudioStatus } from "expo-audio";

import type { LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { usePlayerStore } from "@/store/playerStore";

jest.mock("expo-audio", () => {
  const listeners: ((status: unknown) => void)[] = [];
  return {
    __listeners: listeners,
    createAudioPlayer: jest.fn(() => ({
      addListener: jest.fn((_event: string, listener: (status: unknown) => void) => {
        listeners.push(listener);
      }),
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
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
    getTrackById: jest.fn(),
    getSessionsByTrack: jest.fn(),
    getOpenContextPlays: jest.fn(),
    insertContextPlay: jest.fn(),
    finalizeContextPlay: jest.fn(),
    touchContextPlay: jest.fn(),
    insertSession: jest.fn(),
    saveCheckpoint: jest.fn(),
    finalizeSession: jest.fn(),
    deleteCheckpoint: jest.fn(),
    setTrackAvailability: jest.fn(),
    setTrackDuration: jest.fn(async () => undefined),
    newStretchId: jest.fn(() => "stretch-new"),
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
};

const db = jest.mocked(LocalDBService);

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
    duration: 0,
    isLoaded: true,
    isBuffering: false,
    playing: false,
    didJustFinish: false,
    playbackRate: 1,
    ...overrides,
  } as AudioStatus;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function track(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: "t1",
    serverId: null,
    contentHash: "online:archive-fa:item-1",
    title: "Episode 1",
    fileName: null,
    fileUri: "https://archive.example/1.mp3",
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
    source: null,
    sourceUri: null,
    sourcePath: null,
    sourceSize: null,
    sourceMtime: null,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: 1,
    discNumber: null,
    year: null,
    availability: "present",
    origin: "online",
    streamUrl: "https://archive.example/1.mp3",
    sourceId: "archive-fa",
    externalId: "item-1",
    collectionKey: "archive-fa:item-1",
    collectionTitle: "Episode 1",
    downloadedAt: null,
    downloadPath: null,
    ...overrides,
  };
}

function waiting() {
  return usePlayerStore.getState().waiting;
}

beforeEach(() => {
  jest.clearAllMocks();
  TrackPlayerService.__resetForTests();
  usePlayerStore.getState().reset();

  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  })) as unknown as typeof fetch;

  db.getTrackById.mockResolvedValue(track());
  db.getSessionsByTrack.mockResolvedValue([]);
  db.getOpenContextPlays.mockResolvedValue([]);
  db.insertSession.mockResolvedValue({
    id: "session-1",
    serverId: null,
    trackId: "t1",
    contentHash: "online:archive-fa:item-1",
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
    stretchId: "stretch-new",
    seeked: false,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  });
  db.finalizeSession.mockResolvedValue(undefined);
  db.saveCheckpoint.mockResolvedValue(undefined);
  db.deleteCheckpoint.mockResolvedValue(undefined);
});

describe("the wait before a stream starts", () => {
  it("is announced before the first status tick, not after it", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);

    const wait = waiting();
    expect(wait).not.toBeNull();
    expect(wait?.kind).toBe("connecting");
    // A stream, because the bytes come from someone else's server — that is
    // what makes the screen say "the source" rather than "this file".
    expect(wait?.stream).toBe(true);
  });

  it("survives the ticks that report buffering with nothing playing", async () => {
    // This is the state the platform actually reports for a first buffer:
    // `playing` is false because nothing is playing yet.
    await TrackPlayerService.playQueueAt(["t1"], 0);
    const since = waiting()?.since;

    listener()(tick({ isBuffering: true, playing: false }));
    await settle();

    expect(waiting()?.kind).toBe("connecting");
    expect(waiting()?.since).toBe(since);
  });

  it("ends on the tick that reports audio actually flowing", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);

    listener()(tick({ isBuffering: false, playing: true, currentTime: 1 }));
    await settle();

    expect(waiting()).toBeNull();
    expect(usePlayerStore.getState().status).toBe("playing");
  });

  it("turns into a stall once audio has already played", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    // A session exists now, so the next buffer is not a first connect: the
    // track is the listener's and the connection dropped mid-sentence.
    listener()(tick({ playing: true, isBuffering: true, currentTime: 1 }));
    await settle();

    expect(waiting()?.kind).toBe("buffering");
  });

  it("is not re-armed by a buffering tick after the listener pauses", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);

    TrackPlayerService.pause();
    expect(waiting()).toBeNull();

    // A paused player can keep buffering in the background. Without the
    // service's own intent flag, this tick would put a loader back over a
    // player the listener had just silenced.
    listener()(tick({ isBuffering: true, playing: false }));
    await settle();

    expect(waiting()).toBeNull();
  });

  it("is armed again when the listener resumes", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();
    TrackPlayerService.pause();
    listener()(tick({ playing: false }));
    await settle();

    TrackPlayerService.resume();

    expect(waiting()?.kind).toBe("connecting");
  });

  it("ends badly on an error, with nothing left spinning", async () => {
    await TrackPlayerService.playQueueAt(["t1"], 0);

    listener()(tick({ error: "The source refused the connection." }));
    await settle();

    expect(waiting()).toBeNull();
    expect(usePlayerStore.getState().status).toBe("error");
  });

  it("says file, not source, for audio on the device", async () => {
    db.getTrackById.mockResolvedValue(track({ fileUri: "file:///audio/1.mp3" }));

    await TrackPlayerService.playQueueAt(["t1"], 0);

    expect(waiting()?.stream).toBe(false);
  });
});
