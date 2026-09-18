import {
  buildScanPlan,
  isNearDuplicate,
  isSameFileName,
  libraryEntriesToVerify,
  needsIdentification,
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
    // Defaults to present, because the interesting cases below are the ones that
    // opt *out* of it: a missing entry is what turns a duplicate into a relink.
    availability: "present",
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

describe("needsIdentification", () => {
  it("covers exactly the statuses whose bytes have to be read", () => {
    // One predicate for both the preview's "identifying N files" and the pass
    // that opens them, so the two can never disagree.
    expect(needsIdentification("new")).toBe(true);
    expect(needsIdentification("changed")).toBe(true);
    expect(needsIdentification("relink")).toBe(true);
    expect(needsIdentification("known")).toBe(false);
    expect(needsIdentification("duplicate")).toBe(false);
  });
});

describe("libraryEntriesToVerify", () => {
  it("asks only about rows a discovered file could match", () => {
    // The whole point of the narrowing: a stat is cheap but not free, and only
    // a row whose title could match can ever be a relink candidate.
    const entries = libraryEntriesToVerify(
      [file({ sourceId: "1", fileName: "Intro.mp3" })],
      [
        entry({ contentHash: "h1", title: "Intro", sourceUri: "content://intro" }),
        entry({ contentHash: "h2", title: "Unrelated", sourceUri: "content://other" }),
      ],
    );

    expect(entries.map((item) => item.contentHash)).toEqual(["h1"]);
  });

  it("skips rows already known to be missing", () => {
    const entries = libraryEntriesToVerify(
      [file({ sourceId: "1", fileName: "Intro.mp3" })],
      [
        entry({
          contentHash: "h1",
          title: "Intro",
          sourceUri: "content://intro",
          availability: "missing",
        }),
      ],
    );

    expect(entries).toEqual([]);
  });

  it("skips rows with no recorded location", () => {
    // Nothing to stat, and `isLocationGone` already treats a null URI as gone.
    const entries = libraryEntriesToVerify(
      [file({ sourceId: "1", fileName: "Intro.mp3" })],
      [entry({ contentHash: "h1", title: "Intro", sourceUri: null })],
    );

    expect(entries).toEqual([]);
  });

  it("asks about a shared location once", () => {
    const entries = libraryEntriesToVerify(
      [file({ sourceId: "1", fileName: "Intro.mp3" })],
      [
        entry({ contentHash: "h1", title: "Intro", sourceUri: "content://same" }),
        entry({ contentHash: "h2", title: "Intro", sourceUri: "content://same" }),
      ],
    );

    expect(entries).toHaveLength(1);
  });

  it("matches on the folded title, not the raw one", () => {
    const entries = libraryEntriesToVerify(
      [file({ sourceId: "1", fileName: "03 - Thermodynamics.mp3" })],
      [entry({ contentHash: "h1", title: "Thermodynamics", sourceUri: "content://t" })],
    );

    expect(entries).toHaveLength(1);
  });

  it("asks about nothing when the scan found nothing", () => {
    expect(
      libraryEntriesToVerify([], [entry({ contentHash: "h1", title: "Intro", sourceUri: "content://i" })]),
    ).toEqual([]);
  });
});

describe("buildScanPlan — verified-gone locations", () => {
  it("relinks a file whose recorded location the caller found gone", () => {
    // What a moved folder actually looks like: the row still says `present`,
    // because nothing has looked since it moved. The caller's answer is the
    // evidence, and without it this same input reads as a duplicate.
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "03 - Thermodynamics.mp3", durationSec: 605 })],
      [
        entry({
          contentHash: "hash-t",
          title: "Thermodynamics",
          durationSec: 600,
          sourceUri: "content://old",
        }),
      ],
      new Set(["content://old"]),
    );

    expect(plan.candidates[0].status).toBe("relink");
    expect(plan.candidates[0].duplicateOf).toBe("hash-t");
    expect(plan.summary.identifyCount).toBe(1);
  });

  it("still calls it a duplicate when the recorded location is fine", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "03 - Thermodynamics.mp3", durationSec: 605 })],
      [
        entry({
          contentHash: "hash-t",
          title: "Thermodynamics",
          durationSec: 600,
          sourceUri: "content://live",
        }),
      ],
      new Set(["content://elsewhere"]),
    );

    expect(plan.candidates[0].status).toBe("duplicate");
  });

  it("prefers a verified-gone match over a present one", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "Intro.mp3", durationSec: 600 })],
      [
        entry({
          contentHash: "hash-live",
          title: "Intro",
          durationSec: 600,
          sourceUri: "content://live",
        }),
        entry({
          contentHash: "hash-gone",
          title: "Intro",
          durationSec: 600,
          sourceUri: "content://old",
        }),
      ],
      new Set(["content://old"]),
    );

    expect(plan.candidates[0].duplicateOf).toBe("hash-gone");
    expect(plan.candidates[0].status).toBe("relink");
  });

  it("classifies nothing as a relink without the caller's evidence", () => {
    // No `goneLocations` means the planner cannot tell a moved file from a
    // second copy. It says duplicate rather than guessing at a relink, because
    // guessing wrong moves a row that was never lost.
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "Intro.mp3", durationSec: 600 })],
      [
        entry({
          contentHash: "hash-a",
          title: "Intro",
          durationSec: 600,
          sourceUri: "content://old",
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("duplicate");
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

  it("calls a moved file a relink rather than a duplicate", () => {
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "03 - Thermodynamics.mp3", durationSec: 605 })],
      [
        entry({
          contentHash: "hash-t",
          title: "Thermodynamics",
          durationSec: 600,
          availability: "missing",
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("relink");
    expect(plan.candidates[0].duplicateOf).toBe("hash-t");
  });

  it("still identifies a relink, because title and duration cannot prove it", () => {
    // The one status that is both a match and an action. Skipping the hash here
    // would re-point a row on a filename, which is exactly the guess that loses
    // someone's audio.
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "Intro.mp3", durationSec: 600 })],
      [entry({ contentHash: "hash-t", title: "Intro", durationSec: 600, availability: "missing" })],
    );

    expect(plan.summary.identifyCount).toBe(1);
  });

  it("prefers the missing copy when the library holds both", () => {
    // Same title and length twice: one file still on disk, one gone. The gone
    // one is the only one worth re-pointing — the present copy earns a no-op
    // while the missing copy is the one holding listening history.
    const plan = buildScanPlan(
      [file({ sourceId: "9", fileName: "Intro.mp3", durationSec: 600 })],
      [
        entry({
          contentHash: "hash-present",
          title: "Intro",
          durationSec: 600,
          availability: "present",
        }),
        entry({
          contentHash: "hash-missing",
          title: "Intro",
          durationSec: 600,
          availability: "missing",
        }),
      ],
    );

    expect(plan.candidates[0].status).toBe("relink");
    expect(plan.candidates[0].duplicateOf).toBe("hash-missing");
  });

  it("does not relink twice when a moved file is reachable through two sources", () => {
    // The media index and a folder grant can both surface the same file. The
    // first discovery relinks; the second is a double-discovery of it.
    const plan = buildScanPlan(
      [
        file({ sourceId: "1", fileName: "gone.mp3", durationSec: 300 }),
        file({ sourceId: "2", fileName: "gone.mp3", durationSec: 300 }),
      ],
      [entry({ contentHash: "hash-gone", title: "gone", durationSec: 300, availability: "missing" })],
    );

    expect(plan.candidates.map((candidate) => candidate.status)).toEqual(["relink", "duplicate"]);
    expect(plan.summary.relink).toBe(1);
  });

  it("counts relinks alongside every other status", () => {
    const plan = buildScanPlan(
      [
        file({ sourceId: "1", fileName: "a.mp3" }),
        file({ sourceId: "2", fileName: "gone.mp3", durationSec: 300 }),
      ],
      [
        entry({
          contentHash: "hash-gone",
          title: "gone",
          durationSec: 300,
          availability: "missing",
        }),
      ],
    );

    expect(plan.summary).toEqual({
      total: 2,
      new: 1,
      known: 0,
      changed: 0,
      duplicate: 0,
      relink: 1,
      identifyCount: 2,
    });
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
      relink: 0,
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
