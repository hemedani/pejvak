/**
 * The collection run lifecycle, driven through the real service.
 *
 * `TrackPlayerService` keeps its player, current track and open run in module
 * scope, which is what lets a run outlive a screen — and what makes these tests
 * talk to the status listener the player registered rather than to a callback
 * they own. It also means the state outlives a *test*, so `beforeEach` drops it.
 *
 * The cases that matter are the ones a listener would notice: a track ending
 * must start the next one, the end of the queue must *finish* the collection
 * rather than abandon it, and moving to a queue that is not a collection must
 * end the run instead of crediting the old one with the new tracks.
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

/**
 * The status listener the most recently built player registered. The reset in
 * `beforeEach` discards the player, so each case registers a new one.
 */
function listener(): (status: AudioStatus) => void {
  const registered = audioMock.__listeners[audioMock.__listeners.length - 1];
  if (!registered) {
    throw new Error("no status listener registered — did playback ever start?");
  }
  return registered;
}

/** A status tick. Only the fields the service reads are given real values. */
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
    id: "run-new",
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
const physics = { type: "folder" as const, key: "Physics", title: "Physics" };

beforeEach(() => {
  // Calls only, never implementations: the audio player is built once and cached
  // in the service's module scope, and resetting its stubs would strip `seekTo`
  // of the promise the service chains off.
  jest.clearAllMocks();

  // The service holds the player, the live session and the open run in module
  // scope, and the store is a real one. Both outlive a case unless dropped here,
  // and a leaked session is the difference between "this track finished" and
  // "the previous case's track was torn down".
  TrackPlayerService.__resetForTests();
  usePlayerStore.getState().reset();

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
});

describe("a run through a collection", () => {
  it("opens a run sized to the collection it was started from", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    expect(db.insertContextPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: "folder",
        contextKey: "Lectures",
        contextTitle: "Lectures",
        trackCount: 2,
      }),
    );
    expect(usePlayerStore.getState().context).toEqual(lectures);
  });

  it("links each session to the run that was playing when it started", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    listener()(tick({ playing: true, currentTime: 5 }));
    await settle();

    expect(db.insertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "t1",
        contextPlayId: "run-new",
        contextType: "folder",
        contextKey: "Lectures",
      }),
    );
  });

  it("starts the next track when one finishes, without ending the run", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    // A session has to be in progress for the ending to close one; without this
    // the case would assert against a session that was never started.
    listener()(tick({ playing: true, currentTime: 5 }));
    await settle();
    listener()(tick({ didJustFinish: true }));
    await settle();

    expect(usePlayerStore.getState().trackId).toBe("t2");
    expect(usePlayerStore.getState().queueIndex).toBe(1);
    expect(db.finalizeSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ completed: true }),
    );
    // The collection is not over — only the track is.
    expect(db.finalizeContextPlay).not.toHaveBeenCalled();
  });

  it("finishes the run when the last track ends", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 1, 0, lectures);

    listener()(tick({ didJustFinish: true }));
    await settle();

    expect(db.finalizeContextPlay).toHaveBeenCalledWith(
      "run-new",
      expect.objectContaining({ completed: true, interrupted: false }),
    );
    expect(usePlayerStore.getState().status).toBe("ended");
  });

  it("advances only once per ending, however many ticks report it", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    // Two ticks in the same frame: state is a render behind, so a guard held in
    // state would let both through and silently skip a track.
    listener()(tick({ didJustFinish: true }));
    listener()(tick({ didJustFinish: true }));
    await settle();

    expect(usePlayerStore.getState().queueIndex).toBe(1);
  });

  it("keeps the run when the listener skips within the collection", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await TrackPlayerService.next();

    expect(usePlayerStore.getState().trackId).toBe("t2");
    expect(db.finalizeContextPlay).not.toHaveBeenCalled();
  });

  it("ends the run when playback moves to a queue that is not a collection", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await TrackPlayerService.playQueueAt(["t1"], 0, 0);

    expect(db.finalizeContextPlay).toHaveBeenCalledWith(
      "run-new",
      expect.objectContaining({ completed: false, interrupted: true }),
    );
    expect(usePlayerStore.getState().context).toBeNull();
  });

  it("re-enters an open run instead of counting a second play", async () => {
    db.getOpenContextPlays.mockResolvedValue([
      run({ id: "run-open", trackCount: 24, lastIndex: 8, lastTrackId: "t1" }),
    ]);

    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    // The collection is being *continued*, so it is the same attempt — and the
    // original size is kept, so a folder that grew mid-listen does not report
    // progress that never happened.
    expect(db.insertContextPlay).not.toHaveBeenCalled();
    expect(db.finalizeContextPlay).not.toHaveBeenCalled();
  });

  it("closes another collection's open run when a different one starts", async () => {
    // The open run belongs to a collection the listener is leaving, so it must
    // be closed rather than reused — a key of "Physics" here would be the very
    // collection being started, and reusing it is the correct behaviour.
    db.getOpenContextPlays.mockResolvedValue([
      run({ id: "run-other", contextKey: "Chemistry" }),
    ]);

    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, physics);

    expect(db.finalizeContextPlay).toHaveBeenCalledWith(
      "run-other",
      expect.objectContaining({ completed: false, interrupted: true }),
    );
    expect(db.insertContextPlay).toHaveBeenCalledWith(
      expect.objectContaining({ contextKey: "Physics" }),
    );
  });

  it("records where the run has got to as it moves between tracks", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);

    expect(db.touchContextPlay).toHaveBeenCalledWith("run-new", {
      lastIndex: 0,
      lastTrackId: "t1",
      lastPositionSec: 0,
    });
  });
});
