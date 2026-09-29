/**
 * Online collections as units of playback.
 *
 * The contract this suite pins down is the one that makes the feature work at
 * all: a streamed collection is started exactly the way a folder is — a queue,
 * an entry index, a position, and a `PlaybackContext` that opens a *run*. If
 * the context were missing, every online listen would be a loose queue with no
 * history; if the type were wrong, History would not know how to resume it.
 */

import type { ContextStats, LocalOnlineCollection, LocalTrack } from "@/lib/db/types";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";
import { OnlineCollectionService } from "@/services/OnlineCollectionService";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getCollectionTrackProgress: jest.fn(),
    getContextStats: jest.fn(),
  },
}));

jest.mock("@/services/OnlineCatalogService", () => ({
  OnlineCatalogService: {
    loadCollection: jest.fn(),
    markOpened: jest.fn(),
    setFavorite: jest.fn(),
    removeCollection: jest.fn(),
    saveCollection: jest.fn(),
  },
}));

jest.mock("@/services/DownloadService", () => ({
  startDownload: jest.fn(),
  cancelDownload: jest.fn(),
  retryDownload: jest.fn(),
  getSummary: jest.fn(),
  subscribe: jest.fn(() => () => undefined),
}));

/**
 * Stubbed rather than loaded for real: importing the module pulls in
 * `expo-audio` at the top level, which needs a native runtime this suite has no
 * business standing up to test queue construction.
 */
jest.mock("@/services/TrackPlayerService", () => ({
  playQueueAt: jest.fn(() => Promise.resolve()),
  enqueue: jest.fn(),
}));

const loadCollection = jest.mocked(OnlineCatalogService.loadCollection);
const markOpened = jest.mocked(OnlineCatalogService.markOpened);
const getCollectionTrackProgress = jest.mocked(LocalDBService.getCollectionTrackProgress);
const getContextStats = jest.mocked(LocalDBService.getContextStats);
const playQueueAt = jest.mocked(TrackPlayerService.playQueueAt);
const enqueue = jest.mocked(TrackPlayerService.enqueue);

const NO_STATS: ContextStats = {
  playCount: 0,
  completedPlayCount: 0,
  listenedSec: 0,
  lastPlayedAt: null,
  bestFinishedCount: 0,
};

const META: LocalOnlineCollection = {
  key: "manahej:190",
  serverId: null,
  sourceId: "manahej",
  externalId: "190",
  title: "تاریخ شیعه",
  subtitle: null,
  artworkUrl: null,
  languageCode: "fa",
  trackCount: 3,
  pageUrl: null,
  isFavorite: false,
  lastOpenedAt: null,
  downloadState: "none",
  deletedAt: null,
  syncStatus: "pending",
  createdAt: 0,
  updatedAt: 0,
};

function track(id: string, order: number): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: `Episode ${order}`,
    fileName: null,
    fileUri: `https://dl.manahej.ir/${id}.mp3?md5=signed`,
    durationSec: 600,
    fileSizeBytes: 0,
    mimeType: null,
    isAudiobook: false,
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
    trackNumber: order,
    discNumber: null,
    year: null,
    availability: "present",
    origin: "online",
    streamUrl: `https://dl.manahej.ir/${id}.mp3?md5=signed`,
    sourceId: "manahej",
    externalId: id,
    collectionKey: "manahej:190",
    collectionTitle: "تاریخ شیعه",
    downloadedAt: null,
    downloadPath: null,
  };
}

const TRACKS = [track("7101", 1), track("7102", 2), track("7103", 3)];

beforeEach(() => {
  jest.clearAllMocks();
  loadCollection.mockResolvedValue({ meta: META, tracks: TRACKS, fromCache: false });
  getCollectionTrackProgress.mockResolvedValue({});
  getContextStats.mockResolvedValue(NO_STATS);
});

describe("load", () => {
  it("counts what is finished from this listener's own sessions", async () => {
    getCollectionTrackProgress.mockResolvedValue({
      "7101": { finished: true, resumeSec: 0 },
      "7102": { finished: false, resumeSec: 42 },
    });

    const data = await OnlineCollectionService.load("manahej:190");

    expect(data.finishedCount).toBe(1);
    expect(data.tracks).toHaveLength(3);
    expect(data.totalDurationSec).toBe(1800);
  });

  it("reports the source as unreachable when the catalogue fell back", async () => {
    loadCollection.mockResolvedValue({ meta: META, tracks: TRACKS, fromCache: true });

    await expect(OnlineCollectionService.load("manahej:190")).resolves.toMatchObject({
      fromCache: true,
    });
  });
});

describe("plan", () => {
  it("keeps the source's own order", async () => {
    const data = await OnlineCollectionService.load("manahej:190");

    const plan = OnlineCollectionService.plan(data);

    expect(plan.queueIds).toEqual(["7101", "7102", "7103"]);
  });

  it("resumes at the first unfinished episode, at its saved position", async () => {
    getCollectionTrackProgress.mockResolvedValue({
      "7101": { finished: true, resumeSec: 0 },
      "7102": { finished: false, resumeSec: 90 },
    });

    const data = await OnlineCollectionService.load("manahej:190");
    const plan = OnlineCollectionService.plan(data, "resume");

    expect(plan.startIndex).toBe(1);
    expect(plan.startPositionSec).toBe(90);
  });

  it("restarts from the top when asked", async () => {
    getCollectionTrackProgress.mockResolvedValue({
      "7101": { finished: true, resumeSec: 0 },
    });

    const data = await OnlineCollectionService.load("manahej:190");
    const plan = OnlineCollectionService.plan(data, "restart");

    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });

  it("builds a queue of only what is left when asked for the unfinished", async () => {
    getCollectionTrackProgress.mockResolvedValue({
      "7101": { finished: true, resumeSec: 0 },
      "7103": { finished: true, resumeSec: 0 },
    });

    const data = await OnlineCollectionService.load("manahej:190");
    const plan = OnlineCollectionService.plan(data, "unfinished");

    expect(plan.queueIds).toEqual(["7102"]);
  });

  it("enters at a tapped episode with the whole collection behind it", async () => {
    const data = await OnlineCollectionService.load("manahej:190");

    const plan = OnlineCollectionService.planFromTrack(data, "7102");

    expect(plan?.queueIds).toEqual(["7101", "7102", "7103"]);
    expect(plan?.startIndex).toBe(1);
  });

  it("refuses a track that is not in the collection", async () => {
    const data = await OnlineCollectionService.load("manahej:190");

    expect(OnlineCollectionService.planFromTrack(data, "nope")).toBeNull();
  });
});

describe("startPlan", () => {
  it("opens a run against the collection, not a loose queue", async () => {
    const data = await OnlineCollectionService.load("manahej:190");

    await OnlineCollectionService.startPlan(data, OnlineCollectionService.plan(data));

    expect(playQueueAt).toHaveBeenCalledWith(
      ["7101", "7102", "7103"],
      0,
      0,
      { type: "online", key: "manahej:190", title: "تاریخ شیعه" },
    );
  });

  it("records the collection as opened, so it rises in the listener's list", async () => {
    const data = await OnlineCollectionService.load("manahej:190");

    await OnlineCollectionService.startPlan(data, OnlineCollectionService.plan(data));

    expect(markOpened).toHaveBeenCalledWith("manahej:190");
  });

  it("returns the episode playback entered on, for the player route", async () => {
    const data = await OnlineCollectionService.load("manahej:190");
    const plan = OnlineCollectionService.planFromTrack(data, "7102");
    if (!plan) {
      throw new Error("fixture should plan");
    }

    await expect(OnlineCollectionService.startPlan(data, plan)).resolves.toBe("7102");
  });

  it("does nothing at all for an empty collection", async () => {
    loadCollection.mockResolvedValue({ meta: META, tracks: [], fromCache: false });
    const data = await OnlineCollectionService.load("manahej:190");

    await expect(
      OnlineCollectionService.startPlan(data, OnlineCollectionService.plan(data)),
    ).resolves.toBeNull();
    expect(playQueueAt).not.toHaveBeenCalled();
    expect(markOpened).not.toHaveBeenCalled();
  });
});

describe("play and enqueue", () => {
  it("loads and starts in one call, returning the entry track", async () => {
    await expect(OnlineCollectionService.play("manahej:190")).resolves.toBe("7101");
    expect(playQueueAt).toHaveBeenCalledTimes(1);
  });

  it("appends to the queue without starting playback", async () => {
    const added = await OnlineCollectionService.enqueue("manahej:190");

    expect(added).toBe(3);
    expect(enqueue).toHaveBeenCalledWith(["7101", "7102", "7103"]);
    expect(playQueueAt).not.toHaveBeenCalled();
  });
});
