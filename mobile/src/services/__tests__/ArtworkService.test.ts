import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { getInfoAsync, makeDirectoryAsync, writeAsStringAsync } from "expo-file-system/legacy";

import { EMPTY_AUDIO_INFO } from "@/lib/audioInfo";
import { EMPTY_AUDIO_TAG_BUNDLE, type EmbeddedPicture } from "@/lib/audioTags";
import type { LocalTrack } from "@/lib/db/types";
import { inspectAudioFile, type AudioInspection } from "@/services/AudioInspectionService";
import { backfillArtwork, saveImportedArtwork, storeArtwork } from "@/services/ArtworkService";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: jest.fn(),
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/app/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock("@/services/AudioInspectionService", () => ({
  inspectAudioFile: jest.fn(),
}));

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    setTrackArtwork: jest.fn(),
    markTrackArtworkChecked: jest.fn(),
    getTracksMissingArtwork: jest.fn(),
    countTracksMissingArtwork: jest.fn(),
  },
}));

const digestMock = jest.mocked(digest);
const getInfoAsyncMock = jest.mocked(getInfoAsync);
const makeDirectoryAsyncMock = jest.mocked(makeDirectoryAsync);
const writeAsStringAsyncMock = jest.mocked(writeAsStringAsync);
const inspectAudioFileMock = jest.mocked(inspectAudioFile);
const setTrackArtwork = jest.mocked(LocalDBService.setTrackArtwork);
const markTrackArtworkChecked = jest.mocked(LocalDBService.markTrackArtworkChecked);
const getTracksMissingArtwork = jest.mocked(LocalDBService.getTracksMissingArtwork);

const ARTWORK_DIRECTORY = "file:///data/app/artwork/";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);
const OTHER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x09, 0x09]);

function picture(overrides: Partial<EmbeddedPicture> = {}): EmbeddedPicture {
  return { mimeType: "image/jpeg", pictureType: 3, data: JPEG, ...overrides };
}

/** `FileInfo` is a discriminated union; these are the two arms production reads. */
type Info = Awaited<ReturnType<typeof getInfoAsync>>;

function info(exists: boolean, uri: string): Info {
  return exists
    ? ({ exists: true, uri, size: 1_024, isDirectory: false, modificationTime: 0 } as Info)
    : ({ exists: false, uri, isDirectory: false } as Info);
}

/**
 * A stand-in for SHA-256 that depends on the input. A constant would make the
 * dedup assertions vacuous — any two pictures would "share" a name.
 */
function fakeDigest(): void {
  digestMock.mockImplementation(async (_algorithm, data) => {
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
    let accumulator = 7;
    for (const byte of bytes) {
      accumulator = (accumulator * 31 + byte) & 0xff;
    }
    return new Uint8Array(32).fill(accumulator).buffer;
  });
}

/** The name `storeArtwork` will give a picture, computed the same way it does. */
async function expectedName(pic: EmbeddedPicture, extension = "jpg"): Promise<string> {
  // Copied into a fresh buffer, exactly as production does — `expo-crypto` takes
  // an `ArrayBuffer`-backed view and a borrowed `Uint8Array` does not qualify.
  const result = await digestMock(CryptoDigestAlgorithm.SHA256, new Uint8Array(pic.data));
  const hash = Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${ARTWORK_DIRECTORY}${hash}.${extension}`;
}

function track(id: string, overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id,
    serverId: null,
    title: `Track ${id}`,
    fileName: `${id}.mp3`,
    fileUri: `content://media/${id}`,
    durationSec: 600,
    fileSizeBytes: 5_000_000,
    mimeType: "audio/mpeg",
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
    source: "mediastore",
    sourceUri: `content://media/${id}`,
    sourcePath: null,
    sourceSize: 5_000_000,
    sourceMtime: 0,
    folderKey: "",
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    contentHash: `hash-${id}`,
    ...overrides,
  };
}

function inspection(pic: EmbeddedPicture | null): AudioInspection {
  return {
    info: EMPTY_AUDIO_INFO,
    tag: { ...EMPTY_AUDIO_TAG_BUNDLE, picture: pic },
    picture: pic,
    artworkBytes: pic ? pic.data.length : null,
    artworkMime: pic?.mimeType ?? null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeDigest();
  getInfoAsyncMock.mockResolvedValue(info(false, `${ARTWORK_DIRECTORY}x.jpg`));
  makeDirectoryAsyncMock.mockResolvedValue(undefined);
  writeAsStringAsyncMock.mockResolvedValue(undefined);
  setTrackArtwork.mockResolvedValue(undefined);
  markTrackArtworkChecked.mockResolvedValue(undefined);
});

describe("storeArtwork", () => {
  it("writes the picture under the document directory and returns its URI", async () => {
    const uri = await storeArtwork(picture());

    expect(uri).toBe(await expectedName(picture()));
    expect(uri?.startsWith(ARTWORK_DIRECTORY)).toBe(true);
    expect(makeDirectoryAsyncMock).toHaveBeenCalledWith(ARTWORK_DIRECTORY, { intermediates: true });
    expect(writeAsStringAsyncMock).toHaveBeenCalledWith(uri, expect.any(String), {
      encoding: "base64",
    });
  });

  it("hashes the image, not the track, so one cover resolves to one file", async () => {
    // Two chapters of one audiobook carry the same bytes but describe them
    // differently; they must still land on the same name on disk.
    const first = await storeArtwork(picture());
    const second = await storeArtwork(picture({ pictureType: 4, mimeType: "image/jpeg" }));

    expect(first).toBe(second);
  });

  it("gives two different covers two different files", async () => {
    const first = await storeArtwork(picture());
    const second = await storeArtwork(picture({ data: OTHER, mimeType: "image/png" }));

    expect(first).not.toBe(second);
  });

  it("does not rewrite a picture that is already on disk", async () => {
    const uri = await expectedName(picture());
    getInfoAsyncMock.mockResolvedValue(info(true, uri));

    expect(await storeArtwork(picture())).toBe(uri);
    expect(writeAsStringAsyncMock).not.toHaveBeenCalled();
  });

  it("names the file after the format the picture actually is", async () => {
    const uri = await storeArtwork(picture({ mimeType: "image/png" }));
    expect(uri).toBe(await expectedName(picture(), "png"));
  });

  it("refuses a picture that is empty or larger than a thumbnail", async () => {
    expect(await storeArtwork(picture({ data: new Uint8Array(0) }))).toBeNull();
    expect(await storeArtwork(picture({ data: new Uint8Array(4 * 1024 * 1024 + 1) }))).toBeNull();
    expect(writeAsStringAsyncMock).not.toHaveBeenCalled();
  });

  it("returns null instead of failing an import when the write fails", async () => {
    writeAsStringAsyncMock.mockRejectedValue(new Error("no space left on device"));

    await expect(storeArtwork(picture())).resolves.toBeNull();
  });
});

describe("saveImportedArtwork", () => {
  it("writes a picture the scan already read and points the row at it", async () => {
    await saveImportedArtwork("t1", picture(), false);

    expect(setTrackArtwork).toHaveBeenCalledWith("t1", await expectedName(picture()));
    expect(markTrackArtworkChecked).not.toHaveBeenCalled();
  });

  it("stamps a file with no picture when the tag was read in full", async () => {
    // Without the stamp this row would be re-read on every pass forever, which
    // is the entire reason the column exists.
    await saveImportedArtwork("t1", null, false);

    expect(markTrackArtworkChecked).toHaveBeenCalledWith("t1");
    expect(setTrackArtwork).not.toHaveBeenCalled();
  });

  it("stamps nothing when the tag was truncated, because the picture may be past the window", async () => {
    await saveImportedArtwork("t1", null, true);

    expect(markTrackArtworkChecked).not.toHaveBeenCalled();
    expect(setTrackArtwork).not.toHaveBeenCalled();
  });

  it("leaves the row unstamped when the picture could not be written", async () => {
    // Recording artwork that is not on disk would point the tile at nothing and
    // stop the backfill from ever retrying.
    writeAsStringAsyncMock.mockRejectedValue(new Error("read-only filesystem"));

    await saveImportedArtwork("t1", picture(), false);

    expect(setTrackArtwork).not.toHaveBeenCalled();
    expect(markTrackArtworkChecked).not.toHaveBeenCalled();
  });
});

describe("backfillArtwork", () => {
  it("examines exactly the rows the query returned", async () => {
    getTracksMissingArtwork.mockResolvedValue([track("a"), track("b")]);
    inspectAudioFileMock.mockResolvedValue(inspection(picture()));

    const outcome = await backfillArtwork({ limit: 2 });

    expect(getTracksMissingArtwork).toHaveBeenCalledWith(2);
    expect(outcome).toMatchObject({ scanned: 2, found: 2, empty: 0, failed: 0 });
    expect(setTrackArtwork).toHaveBeenCalledTimes(2);
  });

  it("stamps a file with no picture so the next pass moves on to other rows", async () => {
    getTracksMissingArtwork.mockResolvedValue([track("a")]);
    inspectAudioFileMock.mockResolvedValue(inspection(null));

    const outcome = await backfillArtwork();

    expect(outcome).toMatchObject({ scanned: 1, found: 0, empty: 1, failed: 0 });
    expect(markTrackArtworkChecked).toHaveBeenCalledWith("a");
    expect(setTrackArtwork).not.toHaveBeenCalled();
  });

  it("leaves an unreadable file unstamped so a regranted permission can be retried", async () => {
    getTracksMissingArtwork.mockResolvedValue([track("a")]);
    inspectAudioFileMock.mockRejectedValue(new Error("permission denied"));

    const outcome = await backfillArtwork();

    expect(outcome).toMatchObject({ scanned: 1, empty: 0, failed: 1 });
    expect(markTrackArtworkChecked).not.toHaveBeenCalled();
    expect(setTrackArtwork).not.toHaveBeenCalled();
  });

  it("stamps a row with no location, since no later pass could learn anything", async () => {
    // Leaving it unstamped would let it occupy a slot in every pass forever.
    getTracksMissingArtwork.mockResolvedValue([track("a", { fileUri: null, sourceUri: null })]);

    const outcome = await backfillArtwork();

    expect(outcome).toMatchObject({ scanned: 1, empty: 1, failed: 0 });
    expect(markTrackArtworkChecked).toHaveBeenCalledWith("a");
    expect(inspectAudioFileMock).not.toHaveBeenCalled();
  });

  it("falls back to the source URI when the playback URI is gone", async () => {
    getTracksMissingArtwork.mockResolvedValue([
      track("a", { fileUri: null, sourceUri: "content://tree/a.mp3" }),
    ]);
    inspectAudioFileMock.mockResolvedValue(inspection(picture()));

    await backfillArtwork();

    expect(inspectAudioFileMock).toHaveBeenCalledWith(
      "content://tree/a.mp3",
      expect.objectContaining({ includeArtwork: true }),
    );
  });

  it("stops early when the caller cancels", async () => {
    getTracksMissingArtwork.mockResolvedValue([track("a"), track("b"), track("c")]);
    inspectAudioFileMock.mockResolvedValue(inspection(picture()));
    let calls = 0;

    const outcome = await backfillArtwork({
      isCancelled: () => {
        calls += 1;
        return calls > 1;
      },
    });

    expect(outcome.scanned).toBe(1);
  });

  it("does nothing at all when the library has no artwork left to find", async () => {
    getTracksMissingArtwork.mockResolvedValue([]);

    const outcome = await backfillArtwork();

    expect(outcome).toEqual({ scanned: 0, found: 0, empty: 0, failed: 0 });
    expect(inspectAudioFileMock).not.toHaveBeenCalled();
  });
});
