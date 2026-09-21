/**
 * Where one listen ends and the next begins.
 *
 * The rule the listener stated is about *intent*: scrubbing inside a track
 * changes nothing, a track that ends by itself is not the listener's doing, and
 * moving to another track by hand is. So the cases here drive the real service
 * through all three and read back the `stretchId` it wrote on each session —
 * the only place the grouping is actually decided.
 *
 * `TrackPlayerService` keeps the player, the live session and the open run in
 * module scope, so `beforeEach` drops them; a leaked session is the difference
 * between "this track finished" and "the previous case's track was torn down".
 *
 * `newStretchId` is given a *sequence*, not a constant. A stub that always
 * returned the same id would make every "these two are the same listen"
 * assertion below pass without the handover working at all.
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

/** The stretch each session was opened with, in the order they were opened. */
function stretchIds(): (string | undefined)[] {
  return db.insertSession.mock.calls.map(([input]) => input.stretchId);
}

/** Starts playback and opens the first session, as a real play would. */
async function playFirst(): Promise<void> {
  listener()(tick({ playing: true, currentTime: 5 }));
  await settle();
  // A case that asserted against a session that was never opened would be
  // asserting against the previous case's state, which is the one thing the
  // module-scope reset in `beforeEach` exists to prevent.
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

describe("a track that ends by itself", () => {
  it("keeps the next track inside the same listen", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    listener()(tick({ didJustFinish: true }));
    await settle();
    // The next track begins when the player reports it playing, exactly as it
    // would after a real auto-advance.
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    const ids = stretchIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    // One stretch was minted for the whole listen, not one per track.
    expect(db.newStretchId).toHaveBeenCalledTimes(1);
  });

  it("closes the finished track as complete rather than interrupted", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    listener()(tick({ didJustFinish: true }));
    await settle();

    expect(db.finalizeSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ completed: true, interrupted: false }),
    );
  });
});

describe("changing track by hand", () => {
  it("ends the current listen and starts a new one", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.next();
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    const ids = stretchIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
    expect(db.newStretchId).toHaveBeenCalledTimes(2);
  });

  it("records the track it left as interrupted, not as heard through", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.next();

    expect(db.finalizeSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ completed: false, interrupted: true }),
    );
  });

  it("starts a new listen when stepping back a track", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 1, 0, lectures);
    await playFirst();

    await TrackPlayerService.previous();
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    const ids = stretchIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("starts a new listen when a fresh queue is loaded", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.playQueueAt(["t1"], 0, 0);
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    const ids = stretchIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });
});

describe("a queue that simply runs out", () => {
  it("does not hand its listen to whatever plays next", async () => {
    // The trap this guards: inferring "continue the listen" from the finished
    // track's `completed` flag instead of handing the stretch forward. A queue
    // that ended on its last track also sets that flag, so the next thing the
    // listener chose would be silently absorbed into a listen that was over.
    await TrackPlayerService.playQueueAt(["t1", "t2"], 1, 0, lectures);
    await playFirst();

    listener()(tick({ didJustFinish: true }));
    await settle();
    expect(usePlayerStore.getState().status).toBe("ended");

    await TrackPlayerService.playQueueAt(["t1"], 0, 0);
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    const ids = stretchIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });
});

describe("scrubbing inside the current track", () => {
  it("does not end the listen or begin another", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.seekTo(120);
    await settle();

    expect(db.finalizeSession).not.toHaveBeenCalled();
    expect(db.insertSession).toHaveBeenCalledTimes(1);
  });

  it("records that the listen was not heard straight through", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.seekTo(120);
    await settle();

    expect(db.markSessionSeeked).toHaveBeenCalledWith("sess-1");
  });

  it("costs one write however far the scrubber is dragged", async () => {
    // A drag across the scrubber fires many seeks; the flag is per listen, so
    // the second one has nothing left to record.
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.seekTo(120);
    await TrackPlayerService.seekTo(180);
    await TrackPlayerService.seekTo(240);
    await settle();

    expect(db.markSessionSeeked).toHaveBeenCalledTimes(1);
  });

  it("reports a scrub on the listen that is open now, not an earlier one", async () => {
    await TrackPlayerService.playQueueAt(["t1", "t2"], 0, 0, lectures);
    await playFirst();

    await TrackPlayerService.seekTo(120);
    await settle();

    await TrackPlayerService.next();
    listener()(tick({ playing: true, currentTime: 1 }));
    await settle();

    db.markSessionSeeked.mockClear();
    await TrackPlayerService.seekTo(30);
    await settle();

    // The flag belongs to a listen, so the new one is free to report its own.
    expect(db.markSessionSeeked).toHaveBeenCalledTimes(1);
  });
});
