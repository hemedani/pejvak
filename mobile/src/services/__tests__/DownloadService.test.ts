/**
 * Downloading a collection onto the device.
 *
 * This is the suite for the promise the feature makes out loud: after a
 * download, the course is a folder of numbered files named for the episodes,
 * every row points at its own copy, and a file that will not arrive does not
 * take the rest of the course down with it.
 *
 * The database is a small in-memory implementation rather than a set of
 * constant-returning stubs, and deliberately so: the whole design of this
 * service is that the *rows* are the state — progress is a `COUNT`, a resume
 * picks the first row that is not done — so a stub that returns "12 of 29"
 * forever would make every assertion here vacuous.
 */

import type {
  LocalDownloadFile,
  LocalDownloadJob,
  LocalDownloadScope,
  LocalOnlineCollection,
  LocalTrack,
} from "@/lib/db/types";
import { seriesFolderKey, seriesScopeKey } from "@/lib/online/naming";
import * as DownloadService from "@/services/DownloadService";
import { LocalDBService } from "@/services/LocalDBService";
// Named, not the composed object: `DownloadService` imports this one function
// directly, so mocking the object would leave the call site undefined.
import { resolveStreamUrls } from "@/services/OnlineCatalogService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getTracksByIds: jest.fn(async () => []),
    getOnlineCollection: jest.fn(),
    getTracksByCollection: jest.fn(),
    replaceDownloadJobs: jest.fn(),
    getDownloadJobs: jest.fn(),
    getNextDownloadJob: jest.fn(),
    setDownloadJobState: jest.fn(),
    updateDownloadJobProgress: jest.fn(),
    incrementDownloadJobAttempts: jest.fn(),
    getDownloadProgress: jest.fn(),
    getDownloadingOnlineCollections: jest.fn(),
    setOnlineCollectionDownloadState: jest.fn(),
    cancelDownloadJobs: jest.fn(),
    markTrackDownloaded: jest.fn(),
    getDownloadedTrackPaths: jest.fn(),
    forgetDownloadedTracks: jest.fn(),
    deleteDownloadJobs: jest.fn(),
    getDownloadedFiles: jest.fn(async () => []),
    getDownloadedFilePaths: jest.fn(async () => []),
    getDownloadedTrackIds: jest.fn(async () => []),
    deleteDownloadedFiles: jest.fn(async () => []),
    recordDownloadedFile: jest.fn(async () => undefined),
    getDownloadScope: jest.fn(async () => null),
    getDownloadingSeriesScopes: jest.fn(async () => []),
    upsertDownloadScope: jest.fn(),
    setDownloadScopeState: jest.fn(),
    deleteDownloadScope: jest.fn(),
    refreshTrackLocation: jest.fn(async () => undefined),
    refreshTrackLocations: jest.fn(async () => undefined),
  },
}));

jest.mock("@/services/OnlineCatalogService", () => ({
  resolveStreamUrls: jest.fn(),
}));

jest.mock("@/services/AudioInspectionService", () => ({
  inspectAudioFile: jest.fn(),
}));

/**
 * A minimal `expo-file-system`, with the paths actually joined.
 *
 * The names are the thing under test, so the fake has to build a real path out
 * of the arguments rather than accept one — a fake that returned a constant uri
 * would pass whether or not the naming was correct.
 */
jest.mock("expo-file-system", () => {
  /**
   * Join like the real module does: the base keeps its own scheme (`file:///`)
   * and every following part is appended with exactly one separator. A naive
   * "collapse the double slashes" pass would eat the `//` of `file://` and make
   * every path assertion in this file quietly wrong.
   */
  const joinUri = (...parts: unknown[]): string => {
    const values = parts.map((part) =>
      typeof part === "string" ? part : String((part as { uri: string }).uri),
    );
    const [head = "", ...rest] = values;
    return [head.replace(/\/+$/, ""), ...rest.map((part) => part.replace(/^\/+|\/+$/g, ""))]
      .filter((part) => part.length > 0)
      .join("/");
  };

  /**
   * What the fake disk holds. Seeded per test, and the reason `delete()` has to
   * be conditional: a fake that claimed every path existed would let a delete
   * pass without checking anything, and a fake that claimed none did would let
   * it pass by doing nothing.
   */
  const existing = new Set<string>();
  /** Every `delete()` the code under test performed, in order. */
  const deleted: string[] = [];

  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = joinUri(...parts);
    }
    get exists(): boolean {
      return existing.has(this.uri);
    }
    create(): void {
      existing.add(this.uri);
    }
    delete(): void {
      if (!existing.has(this.uri)) {
        throw new Error(`no such directory: ${this.uri}`);
      }
      deleted.push(this.uri);
      existing.delete(this.uri);
    }
  }

  class File {
    uri: string;
    name: string;
    size: number;
    constructor(base: unknown, name?: string) {
      this.uri = name === undefined ? String(base) : joinUri(base, name);
      this.name = this.uri.split("/").pop() ?? "";
      this.size = 0;
    }
    get exists(): boolean {
      return existing.has(this.uri);
    }
    delete(): void {
      if (!existing.has(this.uri)) {
        throw new Error(`no such file: ${this.uri}`);
      }
      deleted.push(this.uri);
      existing.delete(this.uri);
    }
    static downloadFileAsync = jest.fn();
  }

  return {
    Directory,
    File,
    Paths: { document: { uri: "file:///documents" } },
    __fs: { existing, deleted },
  };
});

// Imported after the mocks so the module under test sees the fakes.
const { inspectAudioFile } = jest.requireMock("@/services/AudioInspectionService") as {
  inspectAudioFile: jest.Mock;
};
const { File: MockFile, __fs } = jest.requireMock("expo-file-system") as {
  File: { downloadFileAsync: jest.Mock };
  __fs: { existing: Set<string>; deleted: string[] };
};

/** What the fake disk holds, and what has been removed from it. */
function seedExisting(paths: readonly string[]): void {
  for (const value of paths) {
    __fs.existing.add(value);
  }
}

function deletedPaths(): string[] {
  return [...__fs.deleted];
}

const getOnlineCollection = jest.mocked(LocalDBService.getOnlineCollection);
const getTracksByCollection = jest.mocked(LocalDBService.getTracksByCollection);
const replaceDownloadJobs = jest.mocked(LocalDBService.replaceDownloadJobs);
const getDownloadJobs = jest.mocked(LocalDBService.getDownloadJobs);
const getNextDownloadJob = jest.mocked(LocalDBService.getNextDownloadJob);
const setDownloadJobState = jest.mocked(LocalDBService.setDownloadJobState);
const updateDownloadJobProgress = jest.mocked(LocalDBService.updateDownloadJobProgress);
const incrementDownloadJobAttempts = jest.mocked(LocalDBService.incrementDownloadJobAttempts);
const getDownloadProgress = jest.mocked(LocalDBService.getDownloadProgress);
const getDownloadingOnlineCollections = jest.mocked(LocalDBService.getDownloadingOnlineCollections);
const setOnlineCollectionDownloadState = jest.mocked(
  LocalDBService.setOnlineCollectionDownloadState,
);
const cancelDownloadJobs = jest.mocked(LocalDBService.cancelDownloadJobs);
const markTrackDownloaded = jest.mocked(LocalDBService.markTrackDownloaded);
const deleteDownloadJobs = jest.mocked(LocalDBService.deleteDownloadJobs);
const getDownloadedFiles = jest.mocked(LocalDBService.getDownloadedFiles);
const getDownloadedFilePaths = jest.mocked(LocalDBService.getDownloadedFilePaths);
const getDownloadedTrackIds = jest.mocked(LocalDBService.getDownloadedTrackIds);
const deleteDownloadedFiles = jest.mocked(LocalDBService.deleteDownloadedFiles);
const recordDownloadedFile = jest.mocked(LocalDBService.recordDownloadedFile);
const getDownloadScope = jest.mocked(LocalDBService.getDownloadScope);
const getDownloadingSeriesScopes = jest.mocked(LocalDBService.getDownloadingSeriesScopes);
const upsertDownloadScope = jest.mocked(LocalDBService.upsertDownloadScope);
const setDownloadScopeState = jest.mocked(LocalDBService.setDownloadScopeState);
const deleteDownloadScope = jest.mocked(LocalDBService.deleteDownloadScope);
const resolveStreamUrlsMock = jest.mocked(resolveStreamUrls);

const KEY = "manahej:190";
const TITLE = "تاریخ شیعه";

/** The in-memory database. */
let jobs: LocalDownloadJob[] = [];
let files: LocalDownloadFile[] = [];
let scopes = new Map<string, LocalDownloadScope>();
let downloadState: LocalOnlineCollection["downloadState"] = "none";
let nextJobId = 1;

function meta(): LocalOnlineCollection {
  return {
    key: KEY,
    serverId: null,
    sourceId: "manahej",
    externalId: "190",
    title: TITLE,
    subtitle: null,
    artworkUrl: null,
    languageCode: "fa",
    trackCount: 3,
    pageUrl: null,
    isFavorite: false,
    lastOpenedAt: null,
    downloadState,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

function track(externalId: string, order: number, downloaded = false): LocalTrack {
  return {
    id: `t-${externalId}`,
    serverId: null,
    contentHash: `hash-${externalId}`,
    title: `Episode ${order}`,
    fileName: null,
    fileUri: downloaded ? `file:///documents/Online/manahej/${TITLE} (190)/0${order} - Episode ${order}.mp3` : `https://dl.x/${externalId}.mp3?md5=s`,
    durationSec: 0,
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
    streamUrl: `https://dl.x/${externalId}.mp3?md5=s`,
    sourceId: "manahej",
    externalId,
    collectionKey: KEY,
    collectionTitle: TITLE,
    downloadedAt: downloaded ? 1 : null,
    downloadPath: downloaded ? `file:///documents/Online/manahej/${TITLE} (190)/0${order} - Episode ${order}.mp3` : null,
  };
}

let tracks = [track("7101", 1), track("7102", 2), track("7103", 3)];

/** Point a track at its best copy, or back at the stream when none is left. */
function applyTrackLocation(trackId: string): void {
  const row = tracks.find((candidate) => candidate.id === trackId);
  if (!row) {
    return;
  }
  const copies = files
    .filter((file) => file.trackId === trackId)
    .sort((a, b) => {
      if (a.scopeKind !== b.scopeKind) {
        return a.scopeKind === "collection" ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });
  const file = copies[0];
  if (file) {
    row.fileUri = file.fileUri;
    row.downloadPath = file.filePath;
    row.downloadedAt = file.createdAt;
    row.fileSizeBytes = file.fileSizeBytes;
    row.folderKey = file.folderKey;
    row.folderName = file.folderName;
    row.trackNumber = file.trackNumber;
    row.availability = "present";
    return;
  }
  row.fileUri = row.streamUrl;
  row.downloadPath = null;
  row.downloadedAt = null;
  row.fileSizeBytes = 0;
  row.folderKey = null;
  row.folderName = null;
  row.availability = row.streamUrl === null ? "missing" : "present";
}

/** Wires the in-memory database into the mocked service surface. */
function installFakeDatabase(): void {
  getOnlineCollection.mockImplementation(async () => meta());
  getTracksByCollection.mockImplementation(async () => tracks);
  getDownloadScope.mockImplementation(async (key) => scopes.get(key) ?? null);
  getDownloadingSeriesScopes.mockImplementation(async () =>
    [...scopes.values()].filter((scope) => scope.downloadState === "downloading"),
  );

  replaceDownloadJobs.mockImplementation(async (inputs) => {
    const scopeKey = inputs[0]?.scopeKey;
    jobs = jobs.filter((job) => job.scopeKey !== scopeKey);
    const created = inputs.map((input) => ({
      id: `job-${nextJobId++}`,
      collectionKey: input.collectionKey,
      scopeKey: input.scopeKey,
      trackId: input.trackId,
      externalId: input.externalId,
      title: input.title,
      orderIndex: input.orderIndex,
      url: input.url,
      destPath: input.destPath,
      state: "queued" as const,
      bytesTotal: 0,
      bytesDone: 0,
      attempts: 0,
      error: null,
      createdAt: 0,
      updatedAt: 0,
    }));
    jobs.push(...created);
    return created;
  });

  getDownloadJobs.mockImplementation(async (scopeKey) =>
    jobs.filter((job) => job.scopeKey === scopeKey),
  );

  getNextDownloadJob.mockImplementation(async (scopeKey) => {
    const next = jobs.find((job) => job.scopeKey === scopeKey && job.state === "queued");
    return next ?? null;
  });

  setDownloadJobState.mockImplementation(async (id, state, error) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (job) {
      job.state = state;
      job.error = error ?? null;
    }
  });

  incrementDownloadJobAttempts.mockImplementation(async (id) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (job) {
      job.attempts += 1;
    }
  });

  updateDownloadJobProgress.mockImplementation(async (id, bytesDone, bytesTotal) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (job) {
      job.bytesDone = bytesDone;
      job.bytesTotal = bytesTotal;
    }
  });

  getDownloadProgress.mockImplementation(async (scopeKey) => {
    const mine = jobs.filter((job) => job.scopeKey === scopeKey);
    return {
      total: mine.length,
      done: mine.filter((job) => job.state === "done").length,
      failed: mine.filter((job) => job.state === "failed").length,
      bytesDone: mine.reduce((total, job) => total + job.bytesDone, 0),
      bytesTotal: mine.reduce((total, job) => total + job.bytesTotal, 0),
    };
  });

  getDownloadingOnlineCollections.mockImplementation(async () =>
    downloadState === "downloading" ? [meta()] : [],
  );

  setOnlineCollectionDownloadState.mockImplementation(async (_key, state) => {
    downloadState = state;
  });

  cancelDownloadJobs.mockImplementation(async (scopeKey) => {
    for (const job of jobs) {
      if (job.scopeKey === scopeKey && (job.state === "queued" || job.state === "running")) {
        job.state = "cancelled";
      }
    }
  });

  markTrackDownloaded.mockImplementation(async (input) => {
    const row = tracks.find((candidate) => candidate.id === input.id);
    if (row) {
      row.fileUri = input.fileUri;
      row.downloadPath = input.downloadPath;
      row.downloadedAt = 1;
      row.fileSizeBytes = input.fileSizeBytes;
      row.folderKey = input.folderKey;
      row.folderName = input.folderName;
      row.trackNumber = input.trackNumber;
      row.availability = "present";
    }
  });

  getDownloadedFiles.mockImplementation(async (scopeKey) =>
    files.filter((file) => file.scopeKey === scopeKey),
  );

  getDownloadedFilePaths.mockImplementation(async (scopeKey) =>
    files.filter((file) => file.scopeKey === scopeKey).map((file) => file.filePath),
  );

  getDownloadedTrackIds.mockImplementation(async (scopeKey) => [
    ...new Set(files.filter((file) => file.scopeKey === scopeKey).map((file) => file.trackId)),
  ]);

  recordDownloadedFile.mockImplementation(async (input) => {
    files = files.filter(
      (file) => !(file.scopeKey === input.scopeKey && file.trackId === input.trackId),
    );
    files.push({ ...input, createdAt: Date.now() });
    applyTrackLocation(input.trackId);
  });

  deleteDownloadedFiles.mockImplementation(async (scopeKey) => {
    const trackIds = [
      ...new Set(files.filter((file) => file.scopeKey === scopeKey).map((file) => file.trackId)),
    ];
    files = files.filter((file) => file.scopeKey !== scopeKey);
    for (const trackId of trackIds) {
      applyTrackLocation(trackId);
    }
    return trackIds;
  });

  upsertDownloadScope.mockImplementation(async (input) => {
    const existing = scopes.get(input.key);
    const scope: LocalDownloadScope = {
      key: input.key,
      collectionKey: input.collectionKey,
      kind: input.kind,
      title: input.title,
      seriesKey: input.seriesKey ?? null,
      downloadState: existing?.downloadState ?? "none",
      createdAt: existing?.createdAt ?? 0,
      updatedAt: 0,
    };
    scopes.set(input.key, scope);
    return scope;
  });
  setDownloadScopeState.mockImplementation(async (key, state) => {
    const scope = scopes.get(key);
    if (scope) {
      scope.downloadState = state;
    }
  });
  deleteDownloadScope.mockImplementation(async (key) => {
    scopes.delete(key);
  });

  deleteDownloadJobs.mockImplementation(async (scopeKey) => {
    jobs = jobs.filter((job) => job.scopeKey !== scopeKey);
  });
}

/** Polls until the download settles, or fails the test on a timeout. */
async function waitForSettled(
  scopeKeyOrTimeout: string | number = KEY,
  timeoutMs = 20_000,
): Promise<void> {
  const scopeKey = typeof scopeKeyOrTimeout === "number" ? KEY : scopeKeyOrTimeout;
  const timeout = typeof scopeKeyOrTimeout === "number" ? scopeKeyOrTimeout : timeoutMs;
  const deadline = Date.now() + timeout;
  for (;;) {
    const progress = await DownloadService.getSummary(scopeKey);
    const settled = progress.total > 0 && progress.done + progress.failed === progress.total;
    if (settled && !progress.running) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`download did not settle: ${JSON.stringify(progress)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  DownloadService.__resetForTests();
  jobs = [];
  files = [];
  scopes = new Map();
  nextJobId = 1;
  downloadState = "none";
  tracks = [track("7101", 1), track("7102", 2), track("7103", 3)];
  __fs.existing.clear();
  __fs.deleted.length = 0;
  installFakeDatabase();
  inspectAudioFile.mockResolvedValue({ info: { durationSec: 1_500 } });
  resolveStreamUrlsMock.mockImplementation(
    async () =>
      new Map(
        tracks.map((row) => [
          row.externalId ?? "",
          {
            externalId: row.externalId ?? "",
            title: row.title,
            artist: null,
            albumTitle: null,
            artworkUrl: null,
            streamUrl: `https://dl.x/${row.externalId}.mp3?md5=fresh`,
            durationSec: 0,
            order: row.trackNumber ?? 1,
            pageUrl: null,
          },
        ]),
      ),
  );
  MockFile.downloadFileAsync.mockImplementation(async (_url: string, destination: { uri: string; name: string }) => ({
    uri: destination.uri,
    name: destination.name,
    size: 4_096,
  }));
});

afterEach(() => {
  DownloadService.__resetForTests();
});

describe("startDownload", () => {
  it("re-resolves the stream URLs instead of trusting the stored ones", async () => {
    await DownloadService.startDownload(KEY);

    // The stored URLs carry a signature that expires; the queue must carry the
    // ones the source is signing today.
    expect(resolveStreamUrlsMock).toHaveBeenCalledWith(KEY);
    expect(jobs.every((job) => job.url.includes("md5=fresh"))).toBe(true);
  });

  it("names the folder after the collection and each file after its position", async () => {
    await DownloadService.startDownload(KEY);

    expect(jobs[0]?.destPath).toBe(
      `file:///documents/Online/manahej/${TITLE} (190)/01 - Episode 1.mp3`,
    );
    expect(jobs[2]?.destPath).toBe(
      `file:///documents/Online/manahej/${TITLE} (190)/03 - Episode 3.mp3`,
    );
  });

  it("numbers the files from the collection's own order, not the download's", async () => {
    await DownloadService.startDownload(KEY);

    expect(jobs.map((job) => job.orderIndex)).toEqual([1, 2, 3]);
  });

  it("queues a file already on the device as done, so the count matches the course", async () => {
    tracks = [track("7101", 1, true), track("7102", 2), track("7103", 3)];

    await DownloadService.startDownload(KEY);
    await waitForSettled();

    // Three jobs, not two: the listener is told "3 of 3", not "0 of 2".
    expect(jobs).toHaveLength(3);
    expect(jobs[0]?.state).toBe("done");
  });

  it("refuses to queue a collection that has nothing in it", async () => {
    tracks = [];

    await expect(DownloadService.startDownload(KEY)).rejects.toThrow(/nothing to download/i);
  });

  it("does not restart a download that is already running", async () => {
    downloadState = "downloading";

    await DownloadService.startDownload(KEY);

    expect(replaceDownloadJobs).not.toHaveBeenCalled();
  });
});

describe("startSeriesDownload", () => {
  it("queues only the series' episodes, in a folder beside the collection's", async () => {
    await DownloadService.startSeriesDownload({
      collectionKey: KEY,
      title: "Series One",
      seriesKey: "series-one",
      trackIds: ["t-7101", "t-7102"],
    });
    const key = seriesScopeKey(KEY, "7101");
    await waitForSettled(key);

    expect(MockFile.downloadFileAsync).toHaveBeenCalledTimes(2);
    expect(scopes.get(key)?.downloadState).toBe("complete");
    const paths = files.map((file) => file.filePath);
    expect(paths).toHaveLength(2);
    // A sibling of "Online/…/<collection> (<id>)", never a child of it.
    expect(paths.every((path) => path.includes(" - Series One (7101)"))).toBe(true);
    expect(paths.every((path) => !path.includes(`${TITLE} (190)/`))).toBe(true);
    expect(files.every((file) => file.folderKey === seriesFolderKey("manahej", "190", "7101"))).toBe(true);
  });

  it("downloads its own copy instead of borrowing the collection's file", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    const collectionPath = files[0]?.filePath;
    expect(collectionPath).toBeDefined();

    await DownloadService.startSeriesDownload({
      collectionKey: KEY,
      title: "Series One",
      seriesKey: "series-one",
      trackIds: ["t-7101"],
    });
    await waitForSettled(seriesScopeKey(KEY, "7101"));

    const seriesCopy = files.find((file) => file.scopeKind === "series");
    expect(seriesCopy?.filePath).not.toBe(collectionPath);
    // Both copies exist; the collection's stays primary for the track.
    expect(files.filter((file) => file.trackId === "t-7101")).toHaveLength(2);
    expect(tracks[0]?.fileUri).toBe(collectionPath);
  });

  it("does not restart a series that is already downloading", async () => {
    const key = seriesScopeKey(KEY, "7101");
    scopes.set(key, {
      key,
      collectionKey: KEY,
      kind: "series",
      title: "Series One",
      seriesKey: "series-one",
      downloadState: "downloading",
      createdAt: 0,
      updatedAt: 0,
    });

    await DownloadService.startSeriesDownload({
      collectionKey: KEY,
      title: "Series One",
      seriesKey: "series-one",
      trackIds: ["t-7101"],
    });

    expect(replaceDownloadJobs).not.toHaveBeenCalled();
  });

  it("refuses a series with no playable episodes", async () => {
    await expect(
      DownloadService.startSeriesDownload({
        collectionKey: KEY,
        title: "Series One",
        seriesKey: "series-one",
        trackIds: [],
      }),
    ).rejects.toThrow("nothing to download");
  });
});

describe("deleting a series download", () => {
  it("keeps the collection's copy and leaves its track downloaded", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    const collectionPath = tracks[0]?.downloadPath;

    await DownloadService.startSeriesDownload({
      collectionKey: KEY,
      title: "Series One",
      seriesKey: "series-one",
      trackIds: ["t-7101"],
    });
    const key = seriesScopeKey(KEY, "7101");
    await waitForSettled(key);
    const seriesPath = files.find((file) => file.scopeKind === "series")?.filePath;
    if (seriesPath) {
      seedExisting([seriesPath]);
    }

    await DownloadService.deleteDownload(key);

    expect(files.some((file) => file.scopeKind === "series")).toBe(false);
    expect(files.some((file) => file.filePath === collectionPath)).toBe(true);
    expect(tracks[0]?.downloadPath).toBe(collectionPath);
    expect(tracks[0]?.downloadedAt).not.toBeNull();
    expect(downloadState).toBe("complete");
    if (seriesPath) {
      expect(__fs.deleted).toContain(seriesPath);
    }
  });
});

describe("the worker", () => {
  it("downloads every file and hands each one to the library", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();

    expect(MockFile.downloadFileAsync).toHaveBeenCalledTimes(3);
    expect(markTrackDownloaded).toHaveBeenCalledTimes(3);
    expect(downloadState).toBe("complete");
  });

  it("files each downloaded track under the collection's folder", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();

    expect(markTrackDownloaded).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUri: `file:///documents/Online/manahej/${TITLE} (190)/02 - Episode 2.mp3`,
        folderKey: "Online/manahej/190",
        folderName: TITLE,
        trackNumber: 2,
      }),
    );
  });

  it("reads the real duration out of the file the source never reported", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();

    expect(inspectAudioFile).toHaveBeenCalled();
    expect(markTrackDownloaded).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 1_500 }),
    );
  });

  it("keeps the course even when one file will not arrive", async () => {
    MockFile.downloadFileAsync.mockImplementation(
      async (url: string, destination: { uri: string; name: string }) => {
        if (url.includes("7102")) {
          throw new Error("connection reset");
        }
        return { uri: destination.uri, name: destination.name, size: 4_096 };
      },
    );

    await DownloadService.startDownload(KEY);
    await waitForSettled(30_000);

    const byExternalId = new Map(jobs.map((job) => [job.externalId, job]));
    expect(byExternalId.get("7101")?.state).toBe("done");
    expect(byExternalId.get("7103")?.state).toBe("done");
    expect(byExternalId.get("7102")?.state).toBe("failed");
    // Three attempts, then written off — the count is what the listener sees.
    expect(byExternalId.get("7102")?.attempts).toBe(3);
    expect(downloadState).toBe("failed");
  }, 60_000);

  it("retries a file that failed once and finishes the course", async () => {
    let attempts = 0;
    MockFile.downloadFileAsync.mockImplementation(
      async (url: string, destination: { uri: string; name: string }) => {
        if (url.includes("7101") && attempts === 0) {
          attempts += 1;
          throw new Error("connection reset");
        }
        return { uri: destination.uri, name: destination.name, size: 4_096 };
      },
    );

    await DownloadService.startDownload(KEY);
    await waitForSettled(30_000);

    expect(downloadState).toBe("complete");
    expect(jobs.every((job) => job.state === "done")).toBe(true);
  }, 60_000);
});

describe("cancel", () => {
  it("stops the queue without undoing what already arrived", async () => {
    await DownloadService.startDownload(KEY);
    await DownloadService.cancelDownload(KEY);

    expect(cancelDownloadJobs).toHaveBeenCalledWith(KEY);
    expect(downloadState).toBe("cancelled");
  });

  it("keeps a finished file's row pointing at its copy", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    await DownloadService.cancelDownload(KEY);

    // Cancelling is "stop spending my data", not "delete what I have".
    expect(markTrackDownloaded).toHaveBeenCalled();
    expect(jobs.every((job) => job.state === "done")).toBe(true);
  });
});

describe("resumeInterruptedDownloads", () => {
  it("picks up a collection a kill left mid-download", async () => {
    // The rows say "downloading" with no process behind them — the state a kill
    // leaves. Resume is what turns it back into a running queue.
    jobs = [
      {
        id: "job-1",
        collectionKey: KEY,
        scopeKey: KEY,
        trackId: "t-7101",
        externalId: "7101",
        title: "Episode 1",
        orderIndex: 1,
        url: "https://dl.x/7101.mp3?md5=fresh",
        destPath: `file:///documents/Online/manahej/${TITLE} (190)/01 - Episode 1.mp3`,
        state: "queued",
        bytesTotal: 0,
        bytesDone: 0,
        attempts: 0,
        error: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    downloadState = "downloading";

    await DownloadService.resumeInterruptedDownloads();
    await waitForSettled();

    expect(MockFile.downloadFileAsync).toHaveBeenCalledTimes(1);
    expect(downloadState).toBe("complete");
  });

  it("picks up a series a kill left mid-download", async () => {
    const key = seriesScopeKey(KEY, "7101");
    scopes.set(key, {
      key,
      collectionKey: KEY,
      kind: "series",
      title: "Series One",
      seriesKey: "series-one",
      downloadState: "downloading",
      createdAt: 0,
      updatedAt: 0,
    });
    jobs = [
      {
        id: "job-s1",
        collectionKey: KEY,
        scopeKey: key,
        trackId: "t-7101",
        externalId: "7101",
        title: "Episode 1",
        orderIndex: 1,
        url: "https://dl.x/7101.mp3?md5=fresh",
        destPath: `file:///documents/Online/manahej/${TITLE} - Series One (7101)/01 - Episode 1.mp3`,
        state: "queued",
        bytesTotal: 0,
        bytesDone: 0,
        attempts: 0,
        error: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    await DownloadService.resumeInterruptedDownloads();
    await waitForSettled(key);

    expect(MockFile.downloadFileAsync).toHaveBeenCalledTimes(1);
    expect(scopes.get(key)?.downloadState).toBe("complete");
  });

  it("does nothing when nothing was interrupted", async () => {
    await DownloadService.resumeInterruptedDownloads();

    expect(MockFile.downloadFileAsync).not.toHaveBeenCalled();
  });
});

/** Polls until a condition holds, so a test can wait for the worker. */
async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("condition never became true");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The three file paths a completed download of the fixture writes. */
function downloadedFilePaths(): string[] {
  return [1, 2, 3].map(
    (order) => `file:///documents/Online/manahej/${TITLE} (190)/0${order} - Episode ${order}.mp3`,
  );
}

const DOWNLOAD_DIRECTORY = `file:///documents/Online/manahej/${TITLE} (190)`;

describe("deleteDownload", () => {
  it("keeps every row and hands it back to streaming", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();

    await DownloadService.deleteDownload(KEY);

    // The row is what history, statistics, annotations and resume positions
    // hang off, and its identity is the content hash — which downloading never
    // changed. So the audio goes and the row stays, pointing back at its stream.
    expect(tracks).toHaveLength(3);
    expect(tracks.every((row) => row.downloadedAt === null)).toBe(true);
    expect(tracks.every((row) => row.downloadPath === null)).toBe(true);
    expect(tracks.every((row) => row.fileUri === row.streamUrl)).toBe(true);
    expect(tracks.every((row) => row.fileSizeBytes === 0)).toBe(true);
  });

  it("clears the folder key, so the folder leaves the Library with the bytes", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    expect(tracks.every((row) => row.folderKey !== null)).toBe(true);

    await DownloadService.deleteDownload(KEY);

    // The Library's Folders view is derived from this column, so a folder whose
    // tracks are not on the device would open onto nothing.
    expect(tracks.every((row) => row.folderKey === null)).toBe(true);
    expect(tracks.every((row) => row.folderName === null)).toBe(true);
    // Not 'missing': that flag offers a relink, and there is no file to relink.
    expect(tracks.every((row) => row.availability === "present")).toBe(true);
  });

  it("removes the files and the folder", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    seedExisting(downloadedFilePaths());

    await DownloadService.deleteDownload(KEY);

    expect(deletedPaths()).toEqual(expect.arrayContaining(downloadedFilePaths()));
    expect(deletedPaths()).toContain(DOWNLOAD_DIRECTORY);
  });

  it("deletes what it recorded, even after the source renames the collection", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    seedExisting(downloadedFilePaths());

    // The show is retitled upstream. The folder on disk keeps the name it was
    // created with, which is what `download_path` records — so a delete that
    // recomputed the path from today's title would remove nothing and leave
    // every byte on the device forever.
    const renamed = { ...meta(), title: "تاریخ شیعه - نسخه دوم" };
    getOnlineCollection.mockImplementation(async () => renamed);

    await DownloadService.deleteDownload(KEY);

    expect(deletedPaths()).toEqual(expect.arrayContaining(downloadedFilePaths()));
    expect(deletedPaths()).not.toContain(`file:///documents/Online/manahej/${renamed.title} (190)`);
  });

  it("survives a file that is already gone", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    // Nothing is seeded, so the fake disk holds none of the recorded files —
    // what a system cleanup or an interrupted write leaves behind. `delete()`
    // throws on a missing path, so this is the check that keeps one absent file
    // from abandoning the rest of the collection.
    await expect(DownloadService.deleteDownload(KEY)).resolves.toBeUndefined();
    expect(tracks.every((row) => row.downloadedAt === null)).toBe(true);
  });

  it("drops the queue, so downloading again starts from the first track", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();
    expect(jobs).toHaveLength(3);

    await DownloadService.deleteDownload(KEY);

    // Deleting is not resumable, and that is the point of choosing it over
    // stopping: the queue goes with the files.
    expect(jobs).toHaveLength(0);
    expect(deleteDownloadJobs).toHaveBeenCalledWith(KEY);
    expect(downloadState).toBe("none");
  });

  it("waits for a file in flight, so it cannot re-mark a reverted row", async () => {
    // The dangerous ordering. The file lands *after* the delete has reverted the
    // rows and removed the bytes; without waiting for the worker, its
    // `finishTrack` would write a `downloaded_at` and a `file_uri` pointing at a
    // file that is already gone — a row that claims to be downloaded and plays
    // nothing. The delay is what puts the write on the far side of the revert.
    let started = false;
    MockFile.downloadFileAsync.mockImplementation(
      async (_url: string, destination: { uri: string; name: string }) => {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { uri: destination.uri, name: destination.name, size: 4_096 };
      },
    );

    await DownloadService.startDownload(KEY);
    await waitUntil(() => started);

    await DownloadService.deleteDownload(KEY);
    // Long enough for the file to land on the far side of the delete. Asserting
    // immediately would check before the dangerous write has had its chance, and
    // a test that looks too early passes for the wrong reason.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // It did land, and the delete undid it — which is the ordering under test.
    expect(markTrackDownloaded).toHaveBeenCalledTimes(1);
    expect(tracks.every((row) => row.downloadedAt === null)).toBe(true);
    expect(tracks.every((row) => row.fileUri === row.streamUrl)).toBe(true);
  });

  it("does not resurrect a delete the process died in the middle of", async () => {
    // The state a kill leaves: the queue has been dropped but the state was
    // never written. No worker is running, so this is the guard's own test.
    jobs = [];
    downloadState = "downloading";

    await DownloadService.resumeInterruptedDownloads();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Not `complete` — and `none` specifically, because that is also what stops
    // the worker: it re-reads the collection every pass, so a guard that returned
    // without writing the state would spin on this row forever.
    expect(downloadState).toBe("none");
  });

  it("never reports a deleted download as complete", async () => {
    await DownloadService.startDownload(KEY);
    await waitForSettled();

    await DownloadService.deleteDownload(KEY);

    // The worker finalizes a collection once its queue drains, and an empty
    // queue arithmetically reads as "not incomplete" — so the state a delete
    // asks for is the one that must survive the worker's own bookkeeping.
    expect(downloadState).toBe("none");
    expect(getDownloadProgress).toHaveBeenCalledWith(KEY);
  });
});
