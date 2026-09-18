import type { DiscoveredFile, LibraryEntry } from "@/lib/scanPlan";
import type { LocalTrack } from "@/lib/db/types";
import { EMPTY_AUDIO_TAGS } from "@/lib/audioTags";
import type { IdentifiedFile } from "@/services/DeviceScanService";
import { FileLocationService } from "@/services/FileLocationService";
import { findGoneLocations, importIdentifiedFiles, loadLibraryIndex } from "@/services/ImportService";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getAllTracks: jest.fn(),
    getTrackByContentHash: jest.fn(),
    getTrackBySourceUri: jest.fn(),
    insertTrack: jest.fn(),
    updateTrackLocation: jest.fn(),
    setTrackAvailability: jest.fn(),
    setTrackArtwork: jest.fn(),
    markTrackArtworkChecked: jest.fn(),
    upsertFolder: jest.fn(),
  },
}));

jest.mock("@/services/SyncService", () => ({
  syncPending: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock("@/services/FileLocationService", () => {
  // One fn behind both shapes, so the object and the named export cannot drift
  // apart and leave the assertions watching a mock production never calls.
  const isLocationReachable = jest.fn();
  return { FileLocationService: { isLocationReachable }, isLocationReachable };
});

const getAllTracks = jest.mocked(LocalDBService.getAllTracks);
const getTrackByContentHash = jest.mocked(LocalDBService.getTrackByContentHash);
const getTrackBySourceUri = jest.mocked(LocalDBService.getTrackBySourceUri);
const insertTrack = jest.mocked(LocalDBService.insertTrack);
const updateTrackLocation = jest.mocked(LocalDBService.updateTrackLocation);
const setTrackAvailability = jest.mocked(LocalDBService.setTrackAvailability);
const setTrackArtwork = jest.mocked(LocalDBService.setTrackArtwork);
const markTrackArtworkChecked = jest.mocked(LocalDBService.markTrackArtworkChecked);
const upsertFolder = jest.mocked(LocalDBService.upsertFolder);
const isLocationReachable = jest.mocked(FileLocationService.isLocationReachable);

const NEW_URI = "content://com.android.externalstorage.documents/tree/lectures/document/moved.mp3";
const OLD_URI = "content://media/external/audio/media/42";

function track(overrides: Partial<LocalTrack> & { id: string; contentHash: string }): LocalTrack {
  return {
    serverId: null,
    title: "Chapter One",
    fileName: "chapter one.mp3",
    fileUri: OLD_URI,
    durationSec: 600,
    fileSizeBytes: 5_000_000,
    mimeType: "audio/mpeg",
    isAudiobook: true,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 4,
    totalListenTimeSec: 900,
    lastPlayedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    source: "mediastore",
    sourceUri: OLD_URI,
    sourcePath: null,
    sourceSize: 5_000_000,
    sourceMtime: 1_700_000_000_000,
    folderKey: "Lectures",
    folderName: "Lectures",
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    ...overrides,
  };
}

function discovered(overrides: Partial<DiscoveredFile> = {}): DiscoveredFile {
  return {
    sourceId: "tree/moved.mp3",
    uri: NEW_URI,
    path: null,
    fileName: "chapter one.mp3",
    sizeBytes: 5_000_000,
    modifiedAt: 1_700_000_500_000,
    durationSec: 600,
    source: "saf",
    folderKey: "Lectures",
    folderName: "Lectures",
    ...overrides,
  };
}

function identified(
  overrides: Partial<IdentifiedFile> = {},
): IdentifiedFile {
  const file = overrides.file ?? discovered();
  return {
    file,
    contentHash: overrides.contentHash ?? "hash-chapter-one",
    fileSizeBytes: file.sizeBytes ?? 0,
    tags: EMPTY_AUDIO_TAGS,
    picture: null,
    tagTruncated: false,
    ...overrides,
  };
}

function entry(overrides: Partial<LibraryEntry> & { contentHash: string }): LibraryEntry {
  return {
    sourceUri: null,
    sourceSize: null,
    sourceMtime: null,
    title: "Chapter One",
    durationSec: 600,
    availability: "present",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: a recorded location still resolves. The tests that care about a
  // moved file opt into `false` explicitly.
  isLocationReachable.mockResolvedValue(true);
  upsertFolder.mockResolvedValue(undefined);
  updateTrackLocation.mockResolvedValue(undefined);
  setTrackAvailability.mockResolvedValue(undefined);
  // Cover-art persistence is a no-op by default: the import path chains
  // `.catch()` onto it, so a bare `jest.fn()` returning `undefined` would throw
  // on a call that is meant to be incidental to the import.
  setTrackArtwork.mockResolvedValue(undefined);
  markTrackArtworkChecked.mockResolvedValue(undefined);
  getTrackBySourceUri.mockResolvedValue(null);
  insertTrack.mockImplementation(async (input) =>
    track({ id: "new-id", contentHash: input.contentHash, availability: "present" }),
  );
});

describe("loadLibraryIndex", () => {
  it("carries availability through, since that is what separates a duplicate from a relink", async () => {
    getAllTracks.mockResolvedValue([
      track({ id: "t1", contentHash: "hash-a", availability: "missing" }),
      track({ id: "t2", contentHash: "hash-b" }),
    ]);

    const index = await loadLibraryIndex();

    expect(index).toEqual([
      {
        contentHash: "hash-a",
        sourceUri: OLD_URI,
        sourceSize: 5_000_000,
        sourceMtime: 1_700_000_000_000,
        title: "Chapter One",
        durationSec: 600,
        availability: "missing",
      },
      expect.objectContaining({ contentHash: "hash-b", availability: "present" }),
    ]);
  });
});

describe("importIdentifiedFiles — relinking", () => {
  it("re-points a missing track instead of inserting a second row", async () => {
    // The whole reason `contentHash` is the identity: the row that already
    // exists is the one holding the sessions and the notes. A fresh insert
    // would leave the listener's history attached to nothing.
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "missing" }),
    );

    const outcome = await importIdentifiedFiles([identified()]);

    expect(insertTrack).not.toHaveBeenCalled();
    expect(outcome.relinked).toBe(1);
    expect(outcome.imported).toEqual([]);
    expect(outcome.duplicates).toBe(0);
  });

  it("relinks when the row still claims to be present but its file has gone", async () => {
    // The case the feature exists for, and the one `availability` cannot
    // describe: the listener moved a folder and nothing has looked since, so the
    // row still says "present". Matching content arriving at a new location,
    // plus an old location that no longer resolves, is the only honest evidence.
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "present" }),
    );
    isLocationReachable.mockResolvedValue(false);

    const outcome = await importIdentifiedFiles([identified()]);

    expect(updateTrackLocation).toHaveBeenCalledTimes(1);
    expect(outcome.relinked).toBe(1);
    expect(outcome.duplicates).toBe(0);
  });

  it("asks about the row's own location, not the incoming one", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "present" }),
    );
    isLocationReachable.mockResolvedValue(false);

    await importIdentifiedFiles([identified()]);

    expect(isLocationReachable).toHaveBeenCalledWith(OLD_URI);
  });

  it("leaves a genuine second copy alone", async () => {
    // Same content, both files still there. Re-pointing the row would move it
    // out of the folder it belongs to for no gain — the copy plays where it is.
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "present" }),
    );
    isLocationReachable.mockResolvedValue(true);

    const outcome = await importIdentifiedFiles([identified()]);

    expect(updateTrackLocation).not.toHaveBeenCalled();
    expect(outcome.duplicates).toBe(1);
    expect(outcome.relinked).toBe(0);
  });

  it("does not spend a stat on a row already known to be missing", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "missing" }),
    );

    await importIdentifiedFiles([identified()]);

    expect(isLocationReachable).not.toHaveBeenCalled();
  });

  it("does not read a same-location file as having moved", async () => {
    // Defensive: the planner classifies this `known` or `changed`, but a file
    // arriving at the URI the row already records can never be evidence of a move.
    getTrackByContentHash.mockResolvedValue(
      track({
        id: "t1",
        contentHash: "hash-chapter-one",
        fileUri: NEW_URI,
        sourceUri: NEW_URI,
      }),
    );
    isLocationReachable.mockResolvedValue(false);

    const outcome = await importIdentifiedFiles([identified()]);

    expect(isLocationReachable).not.toHaveBeenCalled();
    expect(outcome.duplicates).toBe(1);
  });

  it("writes the new location and the folder it moved into", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "missing" }),
    );

    await importIdentifiedFiles([identified()]);

    expect(updateTrackLocation).toHaveBeenCalledWith("t1", {
      sourceUri: NEW_URI,
      sourcePath: null,
      sourceSize: 5_000_000,
      sourceMtime: 1_700_000_500_000,
      folderKey: "Lectures",
      folderName: "Lectures",
    });
  });

  it("does not flag the relinked row as missing again", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "missing" }),
    );

    await importIdentifiedFiles([identified()]);

    // `updateTrackLocation` sets availability back to present in the same
    // statement, so a second write here could only undo the relink.
    expect(setTrackAvailability).not.toHaveBeenCalled();
  });

  it("treats a still-present track with the same hash as a duplicate", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "present" }),
    );

    const outcome = await importIdentifiedFiles([identified()]);

    expect(updateTrackLocation).not.toHaveBeenCalled();
    expect(insertTrack).not.toHaveBeenCalled();
    expect(outcome.duplicates).toBe(1);
    expect(outcome.relinked).toBe(0);
  });

  it("counts relinks and duplicates separately in one pass", async () => {
    getTrackByContentHash.mockImplementation(async (hash) => {
      if (hash === "hash-gone") {
        return track({ id: "t-gone", contentHash: "hash-gone", availability: "missing" });
      }
      if (hash === "hash-here") {
        return track({ id: "t-here", contentHash: "hash-here", availability: "present" });
      }
      return null;
    });

    const outcome = await importIdentifiedFiles([
      identified({ contentHash: "hash-gone" }),
      identified({ contentHash: "hash-here" }),
      identified({
        contentHash: "hash-fresh",
        file: discovered({ sourceId: "tree/fresh.mp3", uri: "content://tree/fresh.mp3" }),
      }),
    ]);

    expect(outcome).toMatchObject({ relinked: 1, duplicates: 1, failed: 0 });
    expect(outcome.imported).toHaveLength(1);
  });

  it("keeps going when one file throws", async () => {
    getTrackByContentHash.mockImplementation(async (hash) => {
      if (hash === "hash-bad") {
        throw new Error("unreadable");
      }
      return track({ id: "t1", contentHash: hash, availability: "missing" });
    });

    const outcome = await importIdentifiedFiles([
      identified({ contentHash: "hash-bad" }),
      identified({ contentHash: "hash-chapter-one" }),
    ]);

    expect(outcome.failed).toBe(1);
    expect(outcome.relinked).toBe(1);
  });

  it("reports progress once per file", async () => {
    getTrackByContentHash.mockResolvedValue(null);
    const onProgress = jest.fn();

    await importIdentifiedFiles(
      [
        identified({ contentHash: "a" }),
        identified({ contentHash: "b" }),
      ],
      { onProgress },
    );

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("importIdentifiedFiles — new files", () => {
  it("inserts a track it has never seen", async () => {
    getTrackByContentHash.mockResolvedValue(null);

    const outcome = await importIdentifiedFiles([identified({ contentHash: "hash-fresh" })]);

    expect(insertTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: "hash-fresh",
        fileUri: NEW_URI,
        sourceUri: NEW_URI,
        folderKey: "Lectures",
      }),
    );
    expect(outcome.imported).toHaveLength(1);
  });

  it("retires the old row when a file was replaced at the same location", async () => {
    // Same URI, different bytes: the old row's history is real, but it can no
    // longer present itself as playable.
    getTrackByContentHash.mockResolvedValue(null);
    getTrackBySourceUri.mockResolvedValue(
      track({ id: "t-old", contentHash: "hash-old", availability: "present" }),
    );

    await importIdentifiedFiles([identified({ contentHash: "hash-new" })]);

    expect(setTrackAvailability).toHaveBeenCalledWith("t-old", "missing");
  });

  it("does not retire the old row when the hash is unchanged", async () => {
    getTrackByContentHash.mockResolvedValue(null);
    getTrackBySourceUri.mockResolvedValue(
      track({ id: "t-old", contentHash: "hash-same", availability: "present" }),
    );

    await importIdentifiedFiles([identified({ contentHash: "hash-same" })]);

    expect(setTrackAvailability).not.toHaveBeenCalled();
  });

  it("persists folder grants so access survives a relaunch", async () => {
    getTrackByContentHash.mockResolvedValue(null);

    await importIdentifiedFiles([identified()], {
      grants: [{ treeUri: "content://tree/lectures", folderKey: "Lectures", folderName: "Lectures" }],
    });

    expect(upsertFolder).toHaveBeenCalledWith({
      key: "Lectures",
      name: "Lectures",
      treeUri: "content://tree/lectures",
    });
  });

  it("pushes to the server only when something was actually written", async () => {
    getTrackByContentHash.mockResolvedValue(
      track({ id: "t1", contentHash: "hash-chapter-one", availability: "missing" }),
    );

    await importIdentifiedFiles([identified()]);

    expect(syncPending).not.toHaveBeenCalled();
  });

  it("pushes to the server after inserting", async () => {
    getTrackByContentHash.mockResolvedValue(null);

    await importIdentifiedFiles([identified({ contentHash: "hash-fresh" })]);

    expect(syncPending).toHaveBeenCalledTimes(1);
  });
});

describe("findGoneLocations", () => {
  it("returns only the locations that no longer resolve", async () => {
    isLocationReachable.mockImplementation(async (uri) => uri !== "content://gone");

    const gone = await findGoneLocations([
      entry({ contentHash: "a", sourceUri: "content://here" }),
      entry({ contentHash: "b", sourceUri: "content://gone" }),
    ]);

    expect([...gone]).toEqual(["content://gone"]);
  });

  it("does not ask about a row with no recorded location", async () => {
    // Nothing to stat — and `isLocationGone` already treats a null URI as gone.
    isLocationReachable.mockResolvedValue(false);

    const gone = await findGoneLocations([entry({ contentHash: "a", sourceUri: null })]);

    expect(isLocationReachable).not.toHaveBeenCalled();
    expect(gone.size).toBe(0);
  });

  it("asks about each entry exactly once", async () => {
    isLocationReachable.mockResolvedValue(true);

    await findGoneLocations([
      entry({ contentHash: "a", sourceUri: "content://a" }),
      entry({ contentHash: "b", sourceUri: "content://b" }),
    ]);

    expect(isLocationReachable).toHaveBeenCalledTimes(2);
  });

  it("returns an empty set for an empty library", async () => {
    expect((await findGoneLocations([])).size).toBe(0);
    expect(isLocationReachable).not.toHaveBeenCalled();
  });
});
