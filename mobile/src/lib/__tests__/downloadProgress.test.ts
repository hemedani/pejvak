import type { LocalDownloadJob } from "../db/types";
import {
  mergeJobs,
  percentOf,
  PROGRESS_WRITE_INTERVAL_MS,
  shouldWriteProgress,
} from "../downloadProgress";

function job(overrides: Partial<LocalDownloadJob> = {}): LocalDownloadJob {
  return {
    id: "j1",
    collectionKey: "c1",
    scopeKey: "c1",
    trackId: "t1",
    externalId: "e1",
    title: "Episode 1",
    orderIndex: 1,
    url: "https://example.test/1.mp3",
    destPath: "/audio/1.mp3",
    state: "running",
    bytesTotal: 1_000,
    bytesDone: 100,
    attempts: 1,
    error: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe("percentOf", () => {
  it("reports zero when the source never gave a size", () => {
    expect(percentOf(500, 0)).toBe(0);
  });

  it("clamps at 100 and at zero", () => {
    expect(percentOf(1_200, 1_000)).toBe(100);
    expect(percentOf(-50, 1_000)).toBe(0);
  });
});

describe("shouldWriteProgress", () => {
  const previous = { bytesWritten: 100, totalBytes: 1_000, at: 10_000 };

  it("writes the first sample", () => {
    expect(shouldWriteProgress(undefined, { bytesWritten: 0, totalBytes: 1_000 }, 0)).toBe(true);
  });

  it("skips a sample inside the interval that moved less than a point", () => {
    expect(
      shouldWriteProgress(previous, { bytesWritten: 105, totalBytes: 1_000 }, 10_010),
    ).toBe(false);
  });

  it("writes once the figure moved a whole point", () => {
    expect(
      shouldWriteProgress(previous, { bytesWritten: 111, totalBytes: 1_000 }, 10_010),
    ).toBe(true);
  });

  it("writes when the interval has elapsed, however little moved", () => {
    expect(
      shouldWriteProgress(
        previous,
        { bytesWritten: 101, totalBytes: 1_000 },
        10_000 + PROGRESS_WRITE_INTERVAL_MS,
      ),
    ).toBe(true);
  });

  it("writes when the total changes, because the percentage is no longer about the same file", () => {
    expect(
      shouldWriteProgress(previous, { bytesWritten: 100, totalBytes: 2_000 }, 10_010),
    ).toBe(true);
  });
});

describe("mergeJobs", () => {
  it("keeps the previous object for a job whose fields are unchanged", () => {
    const before = { t1: job() };
    const after = mergeJobs(before, [job()]);
    expect(after).toBe(before);
    expect(after.t1).toBe(before.t1);
  });

  it("replaces only the job that moved", () => {
    const first = job();
    const second = job({ id: "j2", trackId: "t2" });
    const before = { t1: first, t2: second };
    const after = mergeJobs(before, [job({ bytesDone: 200 }), job({ id: "j2", trackId: "t2" })]);
    expect(after.t1).not.toBe(first);
    expect(after.t1.bytesDone).toBe(200);
    expect(after.t2).toBe(second);
  });

  it("adds a new row and drops one that is gone", () => {
    const before = { t1: job() };
    const after = mergeJobs(before, [job({ id: "j2", trackId: "t2" })]);
    expect(after.t1).toBeUndefined();
    expect(after.t2?.id).toBe("j2");
  });

  it("returns the previous map when an empty poll finds an empty queue", () => {
    const before = {};
    expect(mergeJobs(before, [])).toBe(before);
  });
});
