import type { ContextStats, LocalContextPlay } from "@/lib/db/types";
import {
  contextRouteTarget,
  describeContextStats,
  describeContextType,
  describeRunOutcome,
  describeRunScope,
  formatContextPosition,
  formatPlayCount,
  isPartialRun,
  latestPartialRun,
  runProgressRatio,
  runResumeTargetSec,
  sameContext,
} from "@/lib/playbackContext";

function run(overrides: Partial<LocalContextPlay> = {}): LocalContextPlay {
  return {
    id: "run-1",
    serverId: null,
    contextType: "folder",
    contextKey: "Lectures",
    contextTitle: "Lectures",
    trackCount: 24,
    startedAt: 1000,
    endedAt: 2000,
    lastIndex: 8,
    lastTrackId: "t9",
    lastPositionSec: 120,
    listenedSec: 3600,
    finishedCount: 9,
    completed: false,
    interrupted: true,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function stats(overrides: Partial<ContextStats> = {}): ContextStats {
  return {
    playCount: 0,
    completedPlayCount: 0,
    listenedSec: 0,
    lastPlayedAt: null,
    bestFinishedCount: 0,
    ...overrides,
  };
}

describe("sameContext", () => {
  it("matches on both halves", () => {
    expect(sameContext({ type: "folder", key: "A" }, { type: "folder", key: "A" })).toBe(true);
  });

  it("does not match across types, even with the same key", () => {
    expect(sameContext({ type: "folder", key: "A" }, { type: "playlist", key: "A" })).toBe(false);
  });

  it("does not match different keys", () => {
    expect(sameContext({ type: "folder", key: "A" }, { type: "folder", key: "B" })).toBe(false);
  });

  it("treats two absences as the same non-collection", () => {
    expect(sameContext(null, null)).toBe(true);
  });

  it("does not match a collection against nothing", () => {
    expect(sameContext({ type: "folder", key: "A" }, null)).toBe(false);
    expect(sameContext(null, { type: "folder", key: "A" })).toBe(false);
  });

  it("accepts a bare run row, which has no title", () => {
    // The callers that ask this question compare a live context against a stored
    // run, and a run has no title of its own.
    expect(sameContext({ type: "folder", key: "A" }, { type: "folder", key: "A" })).toBe(true);
  });
});

describe("describeContextType", () => {
  it("names both kinds", () => {
    expect(describeContextType("folder")).toBe("Folder");
    expect(describeContextType("playlist")).toBe("Playlist");
  });
});

describe("contextRouteTarget", () => {
  it("routes a folder to its keyed screen", () => {
    expect(contextRouteTarget({ type: "folder", key: "Lectures/Physics" })).toEqual({
      pathname: "/folder/[key]",
      params: { key: "Lectures/Physics" },
    });
  });

  it("stands in for the storage root, whose key is the empty string", () => {
    // An empty path segment is not a route, so the root folder needs the same
    // stand-in the library screen uses.
    const target = contextRouteTarget({ type: "folder", key: "" });
    expect(target.pathname).toBe("/folder/[key]");
    if (target.pathname !== "/folder/[key]") {
      throw new Error("expected the folder route");
    }
    expect(target.params.key).not.toBe("");
  });

  it("routes a playlist to its id", () => {
    expect(contextRouteTarget({ type: "playlist", key: "p1" })).toEqual({
      pathname: "/playlist/[id]",
      params: { id: "p1" },
    });
  });
});

describe("runProgressRatio", () => {
  it("is the finished share", () => {
    expect(runProgressRatio(6, 24)).toBeCloseTo(0.25);
  });

  it("is 0 for an empty collection rather than NaN", () => {
    expect(runProgressRatio(0, 0)).toBe(0);
  });

  it("clamps, so a run cannot report past its end", () => {
    expect(runProgressRatio(30, 24)).toBe(1);
    expect(runProgressRatio(-1, 24)).toBe(0);
  });
});

describe("isPartialRun", () => {
  it("is true for a run left half-heard", () => {
    expect(isPartialRun(run())).toBe(true);
  });

  it("is false once the queue ran out", () => {
    expect(isPartialRun(run({ completed: true }))).toBe(false);
  });

  it("is false when every track was heard, even if the queue was abandoned", () => {
    // "Interrupted" would also be true here, which is exactly why the partial
    // test is not written in terms of it.
    expect(isPartialRun(run({ finishedCount: 24, interrupted: true }))).toBe(false);
  });

  it("is false for a collection with nothing in it", () => {
    expect(isPartialRun(run({ trackCount: 0, finishedCount: 0 }))).toBe(false);
  });
});

describe("formatContextPosition", () => {
  it("counts from one, the way a listener does", () => {
    expect(formatContextPosition(0, 12)).toBe("1 of 12");
    expect(formatContextPosition(8, 24)).toBe("9 of 24");
  });

  it("is empty for an empty collection", () => {
    expect(formatContextPosition(0, 0)).toBe("");
  });

  it("clamps an index that no longer fits", () => {
    // The collection can shrink between two listens, leaving a stored index past
    // the end.
    expect(formatContextPosition(99, 12)).toBe("12 of 12");
  });
});

describe("describeRunOutcome", () => {
  it("reports a run that reached the end", () => {
    expect(describeRunOutcome(run({ completed: true }))).toEqual({
      label: "Finished",
      tone: "done",
    });
  });

  it("reports a collection heard through but left before the queue ended", () => {
    // From the listener's side the collection *was* heard, so this is not an
    // interruption.
    expect(describeRunOutcome(run({ finishedCount: 24, interrupted: true }))).toEqual({
      label: "All tracks heard",
      tone: "done",
    });
  });

  it("names the partially completed series", () => {
    expect(describeRunOutcome(run({ finishedCount: 9, trackCount: 24 }))).toEqual({
      label: "Stopped at 9 of 24",
      tone: "partial",
    });
  });

  it("says plainly when nothing was finished", () => {
    expect(describeRunOutcome(run({ finishedCount: 0 }))).toEqual({
      label: "Left early",
      tone: "partial",
    });
  });
});

describe("describeContextStats", () => {
  it("says nothing about a collection never played", () => {
    expect(describeContextStats(stats())).toBeNull();
  });

  it("omits the completion clause when nothing was finished", () => {
    expect(describeContextStats(stats({ playCount: 1 }))).toBe("Played 1 time");
    expect(describeContextStats(stats({ playCount: 3 }))).toBe("Played 3 times");
  });

  it("leads with the completion count once there is one", () => {
    expect(describeContextStats(stats({ playCount: 5, completedPlayCount: 3 }))).toBe(
      "Played 5 times, finished 3",
    );
  });

  it("uses a comma, not a middot, so it survives being joined with middots", () => {
    expect(describeContextStats(stats({ playCount: 2, completedPlayCount: 1 }))).not.toContain(
      " · ",
    );
  });
});

describe("formatPlayCount", () => {
  it("is null rather than '0 plays'", () => {
    expect(formatPlayCount(0)).toBeNull();
  });

  it("agrees with its noun", () => {
    expect(formatPlayCount(1)).toBe("1 play");
    expect(formatPlayCount(4)).toBe("4 plays");
  });
});

describe("describeRunScope", () => {
  it("counts the finished tracks", () => {
    expect(describeRunScope(run({ finishedCount: 9, trackCount: 24 }))).toBe(
      "9 of 24 tracks finished",
    );
  });

  it("says so when the whole collection was heard", () => {
    expect(describeRunScope(run({ finishedCount: 24, trackCount: 24 }))).toBe(
      "All 24 tracks finished",
    );
  });

  it("keeps a one-track collection in the singular", () => {
    expect(describeRunScope(run({ finishedCount: 1, trackCount: 1 }))).toBe("All 1 track finished");
  });

  it("names an empty collection rather than dividing by it", () => {
    expect(describeRunScope(run({ trackCount: 0, finishedCount: 0 }))).toBe("Empty collection");
  });
});

describe("runResumeTargetSec", () => {
  it("continues from where the run stopped", () => {
    expect(runResumeTargetSec(run({ lastPositionSec: 421 }))).toBe(421);
  });

  it("replays from the start of the track when the run was finished", () => {
    // Seeking to the end of the last track would complete it the instant it
    // started.
    expect(runResumeTargetSec(run({ completed: true, lastPositionSec: 421 }))).toBe(0);
  });

  it("never returns a negative position", () => {
    expect(runResumeTargetSec(run({ lastPositionSec: -5 }))).toBe(0);
  });
});

describe("latestPartialRun", () => {
  it("picks the newest incomplete run, not the most complete one", () => {
    // A collection finished last week and started again today is one the
    // listener is in the middle of *today*.
    const newest = run({ id: "new", startedAt: 5000, finishedCount: 2 });
    const older = run({ id: "old", startedAt: 1000, finishedCount: 23 });
    expect(latestPartialRun([newest, older])?.id).toBe("new");
  });

  it("skips runs that were finished", () => {
    const done = run({ id: "done", startedAt: 5000, completed: true });
    const partial = run({ id: "partial", startedAt: 1000 });
    expect(latestPartialRun([done, partial])?.id).toBe("partial");
  });

  it("is null when every run was finished", () => {
    expect(latestPartialRun([run({ completed: true })])).toBeNull();
  });

  it("is null with no runs at all", () => {
    expect(latestPartialRun([])).toBeNull();
  });
});
