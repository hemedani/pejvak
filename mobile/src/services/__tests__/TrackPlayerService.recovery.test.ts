import type { LocalSession, PlaybackCheckpoint } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { recoverOrphanedSessions } from "@/services/TrackPlayerService";

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({
    addListener: jest.fn(),
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
  LocalDBService: {
    getOrphanedCheckpoints: jest.fn(),
    getSessionById: jest.fn(),
    insertSession: jest.fn(),
    finalizeSession: jest.fn(),
    deleteCheckpoint: jest.fn(),
  },
}));

jest.mock("@/services/SyncService", () => ({
  syncPending: jest.fn(() => Promise.resolve({})),
}));

const getOrphanedCheckpoints = jest.mocked(LocalDBService.getOrphanedCheckpoints);
const getSessionById = jest.mocked(LocalDBService.getSessionById);
const insertSession = jest.mocked(LocalDBService.insertSession);
const finalizeSession = jest.mocked(LocalDBService.finalizeSession);
const deleteCheckpoint = jest.mocked(LocalDBService.deleteCheckpoint);

const checkpoint: PlaybackCheckpoint = {
  id: "sess-1",
  sessionId: "sess-1",
  trackId: "track-1",
  contentHash: "hash-1",
  positionSec: 300,
  lastPositionSec: 300,
  durationListenedSec: 280,
  playbackSpeed: 1,
  startedAt: 1000,
  timestamp: 5000,
  deviceInfo: null,
};

function openSession(): LocalSession {
  return {
    id: "sess-1",
    serverId: null,
    trackId: "track-1",
    contentHash: "hash-1",
    startedAt: 1000,
    endedAt: null,
    startPositionSec: 0,
    endPositionSec: null,
    durationListenedSec: 280,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("recoverOrphanedSessions", () => {
  it("recreates a missing session, finalizes it, and clears the checkpoint", async () => {
    getOrphanedCheckpoints.mockResolvedValue([checkpoint]);
    getSessionById.mockResolvedValueOnce(null).mockResolvedValueOnce(openSession());

    const recovered = await recoverOrphanedSessions();

    expect(recovered).toBe(1);
    expect(insertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sess-1",
        trackId: "track-1",
        startedAt: 1000,
        startPositionSec: 300,
      }),
    );
    expect(finalizeSession).toHaveBeenCalledWith("sess-1", {
      endedAt: 5000,
      endPositionSec: 300,
      durationListenedSec: 280,
      completed: false,
      interrupted: true,
    });
    expect(deleteCheckpoint).toHaveBeenCalledWith("sess-1");
  });

  it("finalizes an existing open session without recreating it", async () => {
    getOrphanedCheckpoints.mockResolvedValue([checkpoint]);
    getSessionById.mockResolvedValue(openSession());

    await recoverOrphanedSessions();

    expect(insertSession).not.toHaveBeenCalled();
    expect(finalizeSession).toHaveBeenCalledTimes(1);
    expect(deleteCheckpoint).toHaveBeenCalledWith("sess-1");
  });

  it("does nothing when there are no checkpoints", async () => {
    getOrphanedCheckpoints.mockResolvedValue([]);

    expect(await recoverOrphanedSessions()).toBe(0);
    expect(finalizeSession).not.toHaveBeenCalled();
  });
});
