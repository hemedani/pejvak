import {
  CHECKPOINT_INTERVAL_MS,
  SEEK_THRESHOLD_SEC,
  applyProgress,
  createSessionTracker,
} from "@/lib/sessionTracking";

const T0 = 1_000_000;

function tracker(start = 0, speed = 1) {
  return createSessionTracker({
    sessionId: "s1",
    startedAtMs: T0,
    startPositionSec: start,
    playbackSpeed: speed,
  });
}

describe("session tracking", () => {
  it("adds normal forward deltas to durationListenedSec", () => {
    let state = tracker(10);
    state = applyProgress(state, { positionSec: 12, atMs: T0 + 2000 }).state;
    state = applyProgress(state, { positionSec: 14, atMs: T0 + 4000 }).state;

    expect(state.durationListenedSec).toBe(4);
    expect(state.lastPositionSec).toBe(14);
  });

  it("does not count a forward seek", () => {
    const result = applyProgress(tracker(10), { positionSec: 300, atMs: T0 + 1000 });

    expect(result.isSeek).toBe(true);
    expect(result.countedSec).toBe(0);
    expect(result.state.durationListenedSec).toBe(0);
    expect(result.state.lastPositionSec).toBe(300);
  });

  it("does not count a backward seek", () => {
    const state = applyProgress(tracker(300), { positionSec: 120, atMs: T0 + 1000 }).state;
    expect(state.durationListenedSec).toBe(0);
    expect(state.lastPositionSec).toBe(120);
  });

  it("treats exactly the threshold as neither counted nor a seek", () => {
    const result = applyProgress(tracker(0), {
      positionSec: SEEK_THRESHOLD_SEC,
      atMs: T0 + 1000,
    });

    expect(result.isSeek).toBe(false);
    expect(result.countedSec).toBe(0);
  });

  it("ignores zero movement", () => {
    const result = applyProgress(tracker(42), { positionSec: 42, atMs: T0 + 1000 });
    expect(result.countedSec).toBe(0);
    expect(result.isSeek).toBe(false);
  });

  it("flags a checkpoint every 10 seconds of wall-clock time", () => {
    let state = tracker();

    const early = applyProgress(state, { positionSec: 1, atMs: T0 + 5_000 });
    expect(early.checkpointDue).toBe(false);

    const first = applyProgress(state, { positionSec: 1, atMs: T0 + CHECKPOINT_INTERVAL_MS });
    expect(first.checkpointDue).toBe(true);
    state = first.state;

    const between = applyProgress(state, {
      positionSec: 2,
      atMs: T0 + CHECKPOINT_INTERVAL_MS + 1,
    });
    expect(between.checkpointDue).toBe(false);
    state = between.state;

    const second = applyProgress(state, {
      positionSec: 2,
      atMs: T0 + 2 * CHECKPOINT_INTERVAL_MS,
    });
    expect(second.checkpointDue).toBe(true);
  });

  it("rounds the starting position when creating a tracker", () => {
    expect(tracker(12.7).startPositionSec).toBe(13);
  });
});
