import {
  buildScanPlan,
  isNearDuplicate,
  isSameFileName,
  normaliseTitle,
  type DiscoveredFile,
  type LibraryEntry,
} from "@/lib/scanPlan";

const MTIME = 1_700_000_000_000;

function file(overrides: Partial<DiscoveredFile> & { sourceId: string; fileName: string }): DiscoveredFile {
  return {
    uri: `content://media/external/audio/media/${overrides.sourceId}`,
    path: null,
    sizeBytes: 5_000_000,
    modifiedAt: MTIME,
    durationSec: 600,
    source: "mediastore",
    folderKey: null,
    folderName: null,
    ...overrides,
  };
}

function entry(overrides: Partial<LibraryEntry> & { contentHash: string; title: string }): LibraryEntry {
  return {
    sourceUri: null,
    sourceSize: null,
    sourceMtime: null,
    durationSec: 600,
    ...overrides,
  };
}

describe("normaliseTitle", () => {
  it("folds case, punctuation, extension and a leading track number", () => {
    expect(normaliseTitle("03 - Thermodynamics.mp3")).toBe("thermodynamics");
    expect(normaliseTitle("Thermodynamics")).toBe("thermodynamics");
    expect(normaliseTitle("07. Chapter_Seven.mp3")).toBe("chapterseven");
  });

  it("strips accents so tagged and untagged spellings agree", () => {
    expect(normaliseTitle("Café")).toBe(normaliseTitle("Cafe"));
  });
});

describe("isNearDuplicate", () => {
  it("requires a matching title and a matching duration", () => {
    expect(
      isNearDuplicate({ title: "Intro", durationSec: 600 }, { title: "Intro", durationSec: 604 }),
    ).toBe(true);
  });

  it("rejects a matching title with a clearly different duration", () => {
    expect(
      isNearDuplicate({ title: "Intro", durationSec: 100 }, { title: "Intro", durationSec: 600 }),
    ).toBe(false);
  });

  it("rejects an unknown duration rather than guessing", () => {
    expect(
      isNearDuplicate({ title: "Intro", durationSec: 0 }, { title: "Intro", durationSec: 600 }),
    ).toBe(false);
  });
});

describe("isSameFileName", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(isSameFileName("Intro.MP3", " intro.mp3 ")).toBe(true);
    expect(isSameFileName("a.mp3", "b.mp3")).toBe(false);
  });
});

describe("buildScanPlan", () => {
  it("marks every file new when the library is empty", () => {
    const plan = buildScanPlan([file({ sourceId: "1", fileName: "a.mp3" })], []);
    expect(plan.candidates[0].status).toBe("new");
    expect(plan.summary).toMatchObject({ total: 1, new: 1, identifyCount: 1 });
  });

  it("marks a file known when its location, size and mtime are unchanged", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "1", fileName: "a.mp3" })],
      [
        entry({
          contentHash: "hash-a",
          title: "a",
          sourceUri: "content://media/external/audio/media/1",
          sourceSize: 5_000_000,
          sourceMtime: MTIME,
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("known");
    // Nothing to read: this is the whole point of the size+mtime key.
    expect(plan.summary.identifyCount).toBe(0);
  });

  it("marks a file changed when its size differs", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "1", fileName: "a.mp3", sizeBytes: 6_000_000 })],
      [
        entry({
          contentHash: "hash-a",
          title: "a",
          sourceUri: "content://media/external/audio/media/1",
          sourceSize: 5_000_000,
          sourceMtime: MTIME,
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("changed");
    expect(plan.summary.identifyCount).toBe(1);
  });

  it("marks a file changed when its mtime differs", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "1", fileName: "a.mp3", modifiedAt: MTIME + 1 })],
      [
        entry({
          contentHash: "hash-a",
          title: "a",
          sourceUri: "content://media/external/audio/media/1",
          sourceSize: 5_000_000,
          sourceMtime: MTIME,
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("changed");
  });

  it("treats a library row with no recorded signature as changed", () => {
    // Rows imported before device scanning existed have no size or mtime.
    const plan = buildScanPlan(
      [file({ sourceId: "1", fileName: "a.mp3" })],
      [entry({ contentHash: "hash-a", title: "a", sourceUri: "content://media/external/audio/media/1" })],
    );

    expect(plan.candidates[0].status).toBe("changed");
  });

  it("flags a second copy of a track already in the library", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "03 - Thermodynamics.mp3", durationSec: 605 })],
      [entry({ contentHash: "hash-a", title: "Thermodynamics", durationSec: 600 })],
    );

    expect(plan.candidates[0].status).toBe("duplicate");
    expect(plan.candidates[0].duplicateOf).toBe("hash-a");
    expect(plan.summary.identifyCount).toBe(0);
  });

  it("keeps a same-titled track with a different length as new", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "Intro.mp3", durationSec: 600 })],
      [entry({ contentHash: "hash-a", title: "Intro", durationSec: 100 })],
    );

    expect(plan.candidates[0].status).toBe("new");
  });

  it("collapses the same file discovered through two sources", () => {
    const plan = buildScanPlan(
      [
        file({ sourceId: "1", fileName: "lecture 1.mp3", durationSec: 100 }),
        file({ sourceId: "2", fileName: "lecture 1.mp3", durationSec: 600 }),
      ],
      [],
    );

    // Durations disagree, so the near-duplicate rule would not fire — but the
    // filenames are identical, which inside a single scan is a double-discovery.
    expect(plan.candidates.map((candidate) => candidate.status)).toEqual(["new", "duplicate"]);
    expect(plan.candidates[1].duplicateOf).toBe("1");
  });

  it("counts every status and the files that still need identifying", () => {
    const plan = buildScanPlan(
      [
        file({ sourceId: "1", fileName: "a.mp3" }),
        file({ sourceId: "2", fileName: "b.mp3" }),
        file({ sourceId: "3", fileName: "c.mp3", sizeBytes: 9 }),
        file({ sourceId: "4", fileName: "03 - Thermodynamics.mp3", durationSec: 605 }),
      ],
      [
        entry({
          contentHash: "hash-a",
          title: "a",
          sourceUri: "content://media/external/audio/media/1",
          sourceSize: 5_000_000,
          sourceMtime: MTIME,
        }),
        entry({ contentHash: "hash-c", title: "c", sourceUri: "content://media/external/audio/media/3" }),
        entry({ contentHash: "hash-t", title: "Thermodynamics", durationSec: 600 }),
      ],
    );

    expect(plan.summary).toEqual({
      total: 4,
      new: 1,
      known: 1,
      changed: 1,
      duplicate: 1,
      identifyCount: 2,
    });
  });

  it("orders the preview by folder, then naturally by filename", () => {
    const plan = buildScanPlan(
      [
        file({ sourceId: "1", fileName: "lecture 10.mp3", folderKey: "Lectures" }),
        file({ sourceId: "2", fileName: "lecture 2.mp3", folderKey: "Lectures" }),
        file({ sourceId: "3", fileName: "a.mp3", folderKey: "Music" }),
      ],
      [],
    );

    // "Lectures" sorts before "Music", and inside Lectures `2` precedes `10`.
    expect(plan.candidates.map((candidate) => candidate.sourceId)).toEqual(["2", "1", "3"]);
  });
});
