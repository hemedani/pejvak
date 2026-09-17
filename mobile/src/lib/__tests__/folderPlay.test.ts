import {
  UNPLAYED_PROGRESS,
  buildFolderPlan,
  describeFolderProgress,
  describeMissing,
  folderProgressRatio,
  shuffleTracks,
  type FolderPlayableTrack,
  type FolderTrackProgress,
} from "@/lib/folderPlay";

function track(
  id: string,
  overrides: Partial<FolderPlayableTrack> = {},
): FolderPlayableTrack {
  return {
    id,
    fileName: `${id}.mp3`,
    title: id,
    durationSec: 600,
    discNumber: null,
    trackNumber: null,
    availability: "present",
    ...overrides,
  };
}

/** Progress map from a compact spec: `{ id: [finished, resumeSec] }`. */
function progress(
  spec: Record<string, [boolean, number]>,
): Record<string, FolderTrackProgress> {
  return Object.fromEntries(
    Object.entries(spec).map(([id, [finished, resumeSec]]) => [id, { finished, resumeSec }]),
  );
}

describe("shuffleTracks", () => {
  it("keeps every element exactly once", () => {
    const result = shuffleTracks(["a", "b", "c", "d", "e"], Math.random);
    expect([...result].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    shuffleTracks(input, () => 0.5);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("never leaves a hole when the source returns exactly 1", () => {
    // Math.random() is documented as < 1, but an injected source is not, and
    // an off-by-one index here would silently drop a track from the queue.
    const result = shuffleTracks(["a", "b", "c"], () => 1);
    expect(result).toHaveLength(3);
    expect(result).not.toContain(undefined);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("is deterministic for a fixed source", () => {
    // A source that always returns 0 makes Fisher–Yates swap every index with
    // index 0, walking backwards: [a,b,c,d] → [d,b,c,a] → [c,b,d,a] → [b,c,d,a].
    expect(shuffleTracks(["a", "b", "c", "d"], () => 0)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("buildFolderPlan resume mode", () => {
  it("enters at the first unfinished track", () => {
    const plan = buildFolderPlan(
      [track("01"), track("02"), track("03")],
      progress({ "01": [true, 0], "02": [true, 0], "03": [false, 120] }),
    );
    expect(plan.queueIds).toEqual(["01", "02", "03"]);
    expect(plan.startIndex).toBe(2);
    expect(plan.startPositionSec).toBe(120);
  });

  it("replays from the top once everything is finished", () => {
    const plan = buildFolderPlan(
      [track("01"), track("02")],
      progress({ "01": [true, 0], "02": [true, 0] }),
    );
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });

  it("starts a never-played folder at the top, from zero", () => {
    const plan = buildFolderPlan([track("01"), track("02")], {});
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });

  it("does not borrow a later track's position for an unplayed entry track", () => {
    // 01 has no history at all, so the folder opens at the top of 01 — picking
    // up 02's 300 s here would drop the listener into the wrong lecture.
    const plan = buildFolderPlan(
      [track("01"), track("02")],
      progress({ "02": [false, 300] }),
    );
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });

  it("orders naturally so lecture 2 precedes lecture 10", () => {
    const plan = buildFolderPlan(
      [
        track("c", { fileName: "lecture 10.mp3" }),
        track("a", { fileName: "lecture 2.mp3" }),
        track("b", { fileName: "lecture 9.mp3" }),
      ],
      {},
    );
    expect(plan.queueIds).toEqual(["a", "b", "c"]);
  });

  it("prefers track numbers when every track has one", () => {
    const plan = buildFolderPlan(
      [
        track("b", { fileName: "zzz.mp3", trackNumber: 2 }),
        track("a", { fileName: "aaa.mp3", trackNumber: 1 }),
      ],
      {},
    );
    expect(plan.queueIds).toEqual(["a", "b"]);
  });

  it("falls back to filenames when only some tracks are numbered", () => {
    const plan = buildFolderPlan(
      [
        track("b", { fileName: "part two.mp3", trackNumber: 2 }),
        track("a", { fileName: "part one.mp3" }),
      ],
      {},
    );
    expect(plan.queueIds).toEqual(["a", "b"]);
  });

  it("returns an empty plan for an empty folder", () => {
    const plan = buildFolderPlan([], {});
    expect(plan.queueIds).toEqual([]);
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });
});

describe("buildFolderPlan restart mode", () => {
  it("ignores progress and starts at track one from the beginning", () => {
    const plan = buildFolderPlan(
      [track("01"), track("02")],
      progress({ "01": [true, 0], "02": [false, 480] }),
      { mode: "restart" },
    );
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });
});

describe("buildFolderPlan unfinished mode", () => {
  it("queues only what is left, starting at the first of them", () => {
    const plan = buildFolderPlan(
      [track("01"), track("02"), track("03")],
      progress({ "01": [true, 0], "02": [true, 0], "03": [false, 90] }),
      { mode: "unfinished" },
    );
    expect(plan.queueIds).toEqual(["03"]);
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(90);
  });

  it("falls back to the whole folder when nothing is left to finish", () => {
    // A dead button would be worse than replaying; the folder is done, so the
    // honest thing is to play it again from the top.
    const plan = buildFolderPlan(
      [track("01"), track("02")],
      progress({ "01": [true, 0], "02": [true, 0] }),
      { mode: "unfinished" },
    );
    expect(plan.queueIds).toEqual(["01", "02"]);
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });

  it("queues everything when nothing has been played", () => {
    const plan = buildFolderPlan([track("01"), track("02")], {}, { mode: "unfinished" });
    expect(plan.queueIds).toEqual(["01", "02"]);
  });
});

describe("buildFolderPlan shuffle mode", () => {
  it("keeps the same tracks but does not seek into the first one", () => {
    const plan = buildFolderPlan(
      [track("01"), track("02"), track("03")],
      progress({ "02": [false, 300] }),
      { mode: "shuffle", random: () => 0 },
    );
    expect([...plan.queueIds].sort()).toEqual(["01", "02", "03"]);
    expect(plan.startIndex).toBe(0);
    expect(plan.startPositionSec).toBe(0);
  });
});

describe("buildFolderPlan missing files", () => {
  it("drops unreachable tracks from the queue and reports the count", () => {
    const plan = buildFolderPlan(
      [
        track("01"),
        track("02", { availability: "missing" }),
        track("03"),
      ],
      progress({ "01": [true, 0] }),
    );
    expect(plan.queueIds).toEqual(["01", "03"]);
    expect(plan.missingCount).toBe(1);
  });

  it("counts the entry index against the playable list, not the raw list", () => {
    // 01 is missing, so the first unfinished playable track is 03 at index 1 of
    // the queue. Indexing the raw list would have pointed at the missing 02.
    const plan = buildFolderPlan(
      [
        track("01", { availability: "missing" }),
        track("02"),
        track("03"),
      ],
      progress({ "02": [true, 0] }),
    );
    expect(plan.queueIds).toEqual(["02", "03"]);
    expect(plan.startIndex).toBe(1);
  });

  it("reports every track as missing when none are reachable", () => {
    const plan = buildFolderPlan(
      [track("01", { availability: "missing" }), track("02", { availability: "missing" })],
      {},
    );
    expect(plan.queueIds).toEqual([]);
    expect(plan.missingCount).toBe(2);
  });
});

describe("folderProgressRatio", () => {
  it("is the finished share", () => {
    expect(folderProgressRatio(13, 24)).toBeCloseTo(0.5417, 3);
  });

  it("treats an empty folder as zero rather than dividing by zero", () => {
    expect(folderProgressRatio(0, 0)).toBe(0);
  });

  it("clamps out-of-range counts into 0–1", () => {
    expect(folderProgressRatio(30, 24)).toBe(1);
    expect(folderProgressRatio(-1, 24)).toBe(0);
  });
});

describe("describeFolderProgress", () => {
  it("counts plain tracks while nothing is finished", () => {
    expect(describeFolderProgress(0, 24)).toBe("24 tracks");
  });

  it("uses the literal count in the middle of a folder", () => {
    expect(describeFolderProgress(13, 24)).toBe("13 of 24 finished");
  });

  it("celebrates a finished folder rather than restating the ratio", () => {
    expect(describeFolderProgress(24, 24)).toBe("All 24 tracks finished");
  });

  it("singularises one track", () => {
    expect(describeFolderProgress(0, 1)).toBe("1 track");
    expect(describeFolderProgress(1, 1)).toBe("All 1 track finished");
  });

  it("names an empty folder", () => {
    expect(describeFolderProgress(0, 0)).toBe("Empty folder");
  });
});

describe("describeMissing", () => {
  it("stays quiet when nothing is missing", () => {
    expect(describeMissing(0)).toBeNull();
  });

  it("singularises one file", () => {
    expect(describeMissing(1)).toBe("1 file missing");
    expect(describeMissing(3)).toBe("3 files missing");
  });
});

describe("UNPLAYED_PROGRESS", () => {
  it("describes a track with no history", () => {
    expect(UNPLAYED_PROGRESS).toEqual({ finished: false, resumeSec: 0 });
  });
});
