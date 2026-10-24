/**
 * Live streams in the player.
 *
 * A radio station is an online row like any other, so it reaches the player
 * through the same queue and session machinery. Two things must be true of it
 * and are easy to get wrong:
 *
 *   · Its duration never arrives. `expo-audio` reports `Infinity`, which is
 *     `> 0` and would be stored as a duration — and every statistic derived
 *     from that row would then be meaningless.
 *   · It has no "where you left off". A position from last week is a moment in
 *     a broadcast that no longer exists, so the stream starts at zero.
 */

import type { AudioStatus } from "expo-audio";

import type { LocalSession, LocalTrack } from "@/lib/db/types";
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
    getTracksByIds: jest.fn(async () => []),
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

/** A station row: online, live, and with no duration of its own. */
function station(): LocalTrack {
  return {
    id: "live",
    serverId: null,
    contentHash: "online:radiobrowser:station-x",
    title: "Station X",
    fileName: null,
    fileUri: "https://stream.example/live.mp3",
    durationSec: 0,
    fileSizeBytes: 0,
    mimeType: null,
    isAudiobook: true,
    author: "Germany",
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
    streamUrl: "https://stream.example/live.mp3",
    sourceId: "radiobrowser",
    externalId: "station-x",
    collectionKey: "radiobrowser:station-x",
    collectionTitle: "Station X",
    downloadedAt: null,
    downloadPath: null,
  };
}

function previousSession(endPositionSec: number): LocalSession {
  return {
    id: "old",
    serverId: null,
    trackId: "live",
    contentHash: "online:radiobrowser:station-x",
    startedAt: 0,
    endedAt: 1_000,
    startPositionSec: 0,
    endPositionSec,
    durationListenedSec: endPositionSec,
    playbackSpeed: 1,
    completed: false,
    interrupted: true,
    deviceInfo: null,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: "old",
    seeked: false,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  TrackPlayerService.__resetForTests();
  usePlayerStore.getState().reset();

  // The adapter announces the play to the directory; this test is about the
  // player, so the request is answered and nothing else is asserted about it.
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  })) as unknown as typeof fetch;

  const live = station();
  db.getTrackById.mockResolvedValue(live);
  db.getSessionsByTrack.mockResolvedValue([previousSession(300)]);
  db.getOpenContextPlays.mockResolvedValue([]);
  db.insertSession.mockResolvedValue({
    ...previousSession(0),
    id: "new",
    endedAt: null,
    endPositionSec: null,
  });
  db.finalizeSession.mockResolvedValue(undefined);
  db.saveCheckpoint.mockResolvedValue(undefined);
  db.deleteCheckpoint.mockResolvedValue(undefined);
});

describe("a live stream", () => {
  it("starts at zero even when the last listen ended part-way in", async () => {
    await TrackPlayerService.playQueueAt(["live"], 0);

    expect(usePlayerStore.getState().positionSec).toBe(0);
    listener()(tick({ playing: true, currentTime: 0 }));
    await settle();

    expect(db.insertSession).toHaveBeenCalledWith(
      expect.objectContaining({ startPositionSec: 0 }),
    );
  });

  it("never stores Infinity as the track's duration", async () => {
    await TrackPlayerService.playQueueAt(["live"], 0);

    listener()(
      tick({
        playing: true,
        currentTime: 12,
        duration: Number.POSITIVE_INFINITY,
      }),
    );
    await settle();

    expect(usePlayerStore.getState().durationSec).toBe(0);
    expect(db.setTrackDuration).not.toHaveBeenCalled();
  });

  it("still stores a real duration when one arrives", async () => {
    await TrackPlayerService.playQueueAt(["live"], 0);

    listener()(tick({ playing: true, currentTime: 12, duration: 1_830.6 }));
    await settle();

    expect(usePlayerStore.getState().durationSec).toBe(1_830);
    expect(db.setTrackDuration).toHaveBeenCalledWith("live", 1_830);
  });
});
