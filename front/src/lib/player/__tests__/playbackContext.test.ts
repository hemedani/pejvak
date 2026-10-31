import { describe, expect, it } from "vitest";

import {
  describeContextType,
  describeRunOutcome,
  describeRunScope,
  formatContextPosition,
  isPartialRun,
  latestPartialRun,
  runFiguresFromSessions,
  runProgressRatio,
  runResumeTargetSec,
  sameContext,
} from "../playbackContext";
import type { QueuedSession } from "../types";

type Run = {
  startedAt: number;
  completed: boolean;
  finishedCount: number;
  trackCount: number;
  lastPositionSec: number;
};

function run(overrides: Partial<Run> = {}): Run {
  return {
    startedAt: 1000,
    completed: false,
    finishedCount: 9,
    trackCount: 24,
    lastPositionSec: 120,
    ...overrides,
  };
}

function session(overrides: Partial<QueuedSession> = {}): QueuedSession {
  return {
    clientId: "s1",
    contentHash: "hash-a",
    startedAt: 1,
    endedAt: 2,
    startPositionSec: 0,
    endPositionSec: 60,
    durationListenedSec: 60,
    playbackSpeed: 1,
    completed: true,
    interrupted: false,
    stretchId: "stretch",
    seeked: false,
    ...overrides,
  };
}

describe("sameContext", () => {
  it("matches on both halves", () => {
    expect(sameContext({ type: "online", key: "A" }, { type: "online", key: "A" })).toBe(true);
  });

  it("does not match across types, even with the same key", () => {
    expect(sameContext({ type: "online", key: "A" }, { type: "playlist", key: "A" })).toBe(false);
  });

  it("does not match different keys", () => {
    expect(sameContext({ type: "online", key: "A" }, { type: "online", key: "B" })).toBe(false);
  });

  it("treats two absences as the same non-collection", () => {
    expect(sameContext(null, null)).toBe(true);
  });

  it("does not match a collection against nothing", () => {
    expect(sameContext({ type: "online", key: "A" }, null)).toBe(false);
    expect(sameContext(null, { type: "online", key: "A" })).toBe(false);
  });
});

describe("labels", () => {
  it("names both context kinds", () => {
    expect(describeContextType("online")).toBe("Online");
    expect(describeContextType("playlist")).toBe("Playlist");
  });

  it("counts from one", () => {
    expect(formatContextPosition(0, 12)).toBe("1 of 12");
    expect(formatContextPosition(8, 24)).toBe("9 of 24");
    expect(formatContextPosition(99, 12)).toBe("12 of 12");
    expect(formatContextPosition(0, 0)).toBe("");
  });
});

describe("runs", () => {
  it("computes the finished share and clamps", () => {
    expect(runProgressRatio(6, 24)).toBeCloseTo(0.25);
    expect(runProgressRatio(0, 0)).toBe(0);
    expect(runProgressRatio(30, 24)).toBe(1);
    expect(runProgressRatio(-1, 24)).toBe(0);
  });

  it("is partial only while something is left", () => {
    expect(isPartialRun(run())).toBe(true);
    expect(isPartialRun(run({ completed: true }))).toBe(false);
    expect(isPartialRun(run({ finishedCount: 24 }))).toBe(false);
    expect(isPartialRun(run({ trackCount: 0, finishedCount: 0 }))).toBe(false);
  });

  it("describes the outcome without making the reader subtract", () => {
    expect(describeRunOutcome(run({ completed: true }))).toEqual({
      label: "Finished",
      tone: "done",
    });
    expect(describeRunOutcome(run({ finishedCount: 24 }))).toEqual({
      label: "Every track heard",
      tone: "done",
    });
    expect(describeRunOutcome(run())).toEqual({
      label: "Stopped at 9 of 24",
      tone: "partial",
    });
    expect(describeRunOutcome(run({ finishedCount: 0 }))).toEqual({
      label: "Left early",
      tone: "partial",
    });
  });

  it("names the scope in words", () => {
    expect(describeRunScope(run())).toBe("9 of 24 tracks heard");
    expect(describeRunScope(run({ finishedCount: 24 }))).toBe("All 24 tracks heard");
    expect(describeRunScope(run({ trackCount: 0, finishedCount: 0 }))).toBe("Empty collection");
  });

  it("resumes at 0 once the run finished", () => {
    expect(runResumeTargetSec({ completed: false, lastPositionSec: 421 })).toBe(421);
    expect(runResumeTargetSec({ completed: true, lastPositionSec: 421 })).toBe(0);
  });

  it("finds the newest incomplete run", () => {
    const runs = [
      { id: "new", startedAt: 300, completed: true, finishedCount: 5, trackCount: 5 },
      { id: "old", startedAt: 100, completed: false, finishedCount: 1, trackCount: 5 },
    ];
    expect(latestPartialRun(runs)?.id).toBe("old");
  });

  it("counts distinct completed tracks, not completed sessions", () => {
    const rows = [
      session({ clientId: "a", contentHash: "h1", durationListenedSec: 30, contextPlayId: "run-1" }),
      session({ clientId: "b", contentHash: "h1", durationListenedSec: 40, contextPlayId: "run-1" }),
      session({
        clientId: "c",
        contentHash: "h2",
        durationListenedSec: 50,
        completed: false,
        contextPlayId: "run-1",
      }),
      session({ clientId: "d", contentHash: "h3", contextPlayId: "other" }),
    ];

    const figures = runFiguresFromSessions("run-1", rows);
    expect(figures.listenedSec).toBe(120);
    expect(figures.finishedHashes).toEqual(["h1"]);
  });
});
