/**
 * The other way a file goes missing: the listener taps a track whose file was
 * deleted, and nothing has scanned since to notice. The store already shows the
 * error; these tests are about the row learning about it, so the Missing files
 * screen can offer a relink instead of failing again on every tap.
 */

import type { LocalTrack } from "@/lib/db/types";
import { FileLocationService } from "@/services/FileLocationService";
import { LocalDBService } from "@/services/LocalDBService";
import { loadAndPlay } from "@/services/TrackPlayerService";

type StatusHandler = (status: Record<string, unknown>) => void;

let statusHandler: StatusHandler | null = null;

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({
    addListener: jest.fn((_event: string, handler: StatusHandler) => {
      statusHandler = handler;
    }),
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    currentTime: 0,
    playing: false,
  })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "bare" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: { setTrackAvailability: jest.fn() },
}));

jest.mock("@/services/SyncService", () => ({
  syncPending: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock("@/services/FileLocationService", () => {
  const isLocationReachable = jest.fn();
  return { FileLocationService: { isLocationReachable }, isLocationReachable };
});

const setTrackAvailability = jest.mocked(LocalDBService.setTrackAvailability);
const isLocationReachable = jest.mocked(FileLocationService.isLocationReachable);

function track(overrides: Partial<LocalTrack> & { id: string }): LocalTrack {
  return {
    serverId: null,
    contentHash: `hash-${overrides.id}`,
    title: "Chapter One",
    fileName: "chapter one.mp3",
    fileUri: `content://media/external/audio/media/${overrides.id}`,
    durationSec: 600,
    fileSizeBytes: 1_024,
    mimeType: "audio/mpeg",
    isAudiobook: true,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    source: "mediastore",
    sourceUri: `content://media/external/audio/media/${overrides.id}`,
    sourcePath: null,
    sourceSize: 1_024,
    sourceMtime: 0,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    ...overrides,
  };
}

/** The report is deliberately fire-and-forget; give its promise chain a turn. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await Promise.resolve();
  }
}

function failPlayback(): void {
  statusHandler?.({ error: "Failed to load", currentTime: 0, duration: 0, playing: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  setTrackAvailability.mockResolvedValue(undefined);
});

describe("a playback failure with the file gone", () => {
  it("marks the track missing so the library can offer a relink", async () => {
    isLocationReachable.mockResolvedValue(false);

    await loadAndPlay(track({ id: "gone-1" }));
    failPlayback();
    await settle();

    expect(setTrackAvailability).toHaveBeenCalledWith("gone-1", "missing");
  });

  it("leaves a track that is still on disk alone", async () => {
    // A load error is not proof of anything — the check on the file is.
    isLocationReachable.mockResolvedValue(true);

    await loadAndPlay(track({ id: "here-1" }));
    failPlayback();
    await settle();

    expect(setTrackAvailability).not.toHaveBeenCalled();
  });

  it("reports once, not on every status tick", async () => {
    // The player emits a status update every second while it is failing.
    isLocationReachable.mockResolvedValue(false);

    await loadAndPlay(track({ id: "gone-2" }));
    failPlayback();
    failPlayback();
    failPlayback();
    await settle();

    expect(setTrackAvailability).toHaveBeenCalledTimes(1);
    expect(isLocationReachable).toHaveBeenCalledTimes(1);
  });

  it("checks the location it would actually play from", async () => {
    isLocationReachable.mockResolvedValue(false);

    await loadAndPlay(track({ id: "gone-3" }));
    failPlayback();
    await settle();

    expect(isLocationReachable).toHaveBeenCalledWith(
      "content://media/external/audio/media/gone-3",
    );
  });

  it("never blames a track the player refused to load", async () => {
    // `loadAndPlay` refuses a track with no playable URI before it becomes
    // `currentTrack`, so that track can never be the one reported.
    isLocationReachable.mockResolvedValue(false);

    await loadAndPlay(track({ id: "gone-4", fileUri: null }));
    failPlayback();
    await settle();

    expect(setTrackAvailability).not.toHaveBeenCalledWith("gone-4", "missing");
  });
});
