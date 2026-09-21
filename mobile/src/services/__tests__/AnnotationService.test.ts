import { ANNOTATION_COLORS } from "@/lib/annotations";
import type { LocalAnnotation, LocalSession, LocalTrack } from "@/lib/db/types";
import { AnnotationService } from "@/services/AnnotationService";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getAnnotationsByTrack: jest.fn(),
    getSessionsByTrack: jest.fn(),
    insertAnnotation: jest.fn(),
    updateAnnotation: jest.fn(),
    softDeleteAnnotation: jest.fn(),
    hardDeleteAnnotation: jest.fn(),
  },
}));

jest.mock("@/services/SyncService", () => ({
  syncPending: jest.fn(() => Promise.resolve({})),
}));

const getAnnotationsByTrack = jest.mocked(LocalDBService.getAnnotationsByTrack);
const getSessionsByTrack = jest.mocked(LocalDBService.getSessionsByTrack);
const insertAnnotation = jest.mocked(LocalDBService.insertAnnotation);
const updateAnnotation = jest.mocked(LocalDBService.updateAnnotation);
const softDeleteAnnotation = jest.mocked(LocalDBService.softDeleteAnnotation);
const hardDeleteAnnotation = jest.mocked(LocalDBService.hardDeleteAnnotation);
const mockedSyncPending = jest.mocked(syncPending);

const track: Pick<LocalTrack, "id" | "contentHash"> = {
  id: "track-1",
  contentHash: "hash-1",
};

function annotation(id: string, positionSec: number): LocalAnnotation {
  return {
    id,
    serverId: null,
    trackId: "track-1",
    contentHash: "hash-1",
    positionSec,
    text: "",
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

function session(endedAt: number | null): LocalSession {
  const id = `s-${Math.random()}`;
  return {
    id,
    serverId: null,
    trackId: "track-1",
    contentHash: "hash-1",
    startedAt: 0,
    endedAt,
    startPositionSec: 0,
    endPositionSec: endedAt === null ? null : 100,
    durationListenedSec: 100,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: id,
    seeked: false,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getAnnotationsByTrack.mockResolvedValue([]);
  getSessionsByTrack.mockResolvedValue([]);
});

describe("AnnotationService.getTrackAnnotations", () => {
  it("delegates to the local database", async () => {
    const rows = [annotation("a1", 5)];
    getAnnotationsByTrack.mockResolvedValue(rows);

    await expect(AnnotationService.getTrackAnnotations("track-1")).resolves.toBe(rows);
    expect(getAnnotationsByTrack).toHaveBeenCalledWith("track-1");
  });
});

describe("AnnotationService.createAnnotation", () => {
  it("inserts a rounded position under the track identity", async () => {
    const created = annotation("a1", 13);
    insertAnnotation.mockResolvedValue(created);

    const result = await AnnotationService.createAnnotation({
      track,
      positionSec: 12.7,
      text: "Key insight",
    });

    expect(insertAnnotation).toHaveBeenCalledWith({
      trackId: "track-1",
      contentHash: "hash-1",
      positionSec: 13,
      text: "Key insight",
      color: ANNOTATION_COLORS[0],
      timesPlayedBefore: 0,
    });
    expect(result).toBe(created);
  });

  it("trims surrounding whitespace from the note", async () => {
    insertAnnotation.mockResolvedValue(annotation("a1", 1));

    await AnnotationService.createAnnotation({ track, positionSec: 1, text: "  spaced  " });

    expect(insertAnnotation.mock.calls[0][0].text).toBe("spaced");
  });

  it("cycles the palette color by the existing note count", async () => {
    getAnnotationsByTrack.mockResolvedValue([annotation("a0", 1), annotation("a1", 2)]);
    insertAnnotation.mockResolvedValue(annotation("a2", 3));

    await AnnotationService.createAnnotation({ track, positionSec: 3, text: "third" });

    expect(insertAnnotation.mock.calls[0][0].color).toBe(ANNOTATION_COLORS[2]);
  });

  it("snapshots only finalized sessions as timesPlayedBefore", async () => {
    getSessionsByTrack.mockResolvedValue([session(100), session(200), session(null)]);
    insertAnnotation.mockResolvedValue(annotation("a1", 5));

    await AnnotationService.createAnnotation({ track, positionSec: 5, text: "note" });

    expect(insertAnnotation.mock.calls[0][0].timesPlayedBefore).toBe(2);
  });

  it("rejects blank text without inserting", async () => {
    await expect(
      AnnotationService.createAnnotation({ track, positionSec: 5, text: "   " }),
    ).rejects.toThrow(/text is required/i);
    expect(insertAnnotation).not.toHaveBeenCalled();
  });

  it("kicks off a best-effort sync", async () => {
    insertAnnotation.mockResolvedValue(annotation("a1", 5));

    await AnnotationService.createAnnotation({ track, positionSec: 5, text: "note" });

    expect(mockedSyncPending).toHaveBeenCalledTimes(1);
  });
});

describe("AnnotationService.updateAnnotation", () => {
  it("trims the text, updates it, and kicks off a sync", async () => {
    const target = annotation("a1", 30);

    await AnnotationService.updateAnnotation({ annotation: target, text: "  revised  " });

    expect(updateAnnotation).toHaveBeenCalledWith("a1", { text: "revised" });
    expect(mockedSyncPending).toHaveBeenCalledTimes(1);
  });

  it("rejects blank text without updating", async () => {
    await expect(
      AnnotationService.updateAnnotation({ annotation: annotation("a1", 30), text: " " }),
    ).rejects.toThrow(/text is required/i);
    expect(updateAnnotation).not.toHaveBeenCalled();
  });
});

describe("AnnotationService.deleteAnnotation", () => {
  it("tombstones the note and kicks off a sync", async () => {
    await AnnotationService.deleteAnnotation(annotation("a1", 30));

    expect(softDeleteAnnotation).toHaveBeenCalledWith("a1");
    expect(hardDeleteAnnotation).not.toHaveBeenCalled();
    expect(mockedSyncPending).toHaveBeenCalledTimes(1);
  });
});
