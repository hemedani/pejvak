import {
  extrapolatePosition,
  nextAnchorPosition,
  progressRatio,
  shouldResyncToTick,
} from "@/lib/progressSmoothing";

describe("progressRatio", () => {
  it("converts seconds to a fraction of the track", () => {
    expect(progressRatio(45, 90)).toBe(0.5);
  });

  it("is zero before a track has a duration", () => {
    expect(progressRatio(20, 0)).toBe(0);
    expect(progressRatio(20, -5)).toBe(0);
  });

  it("clamps a stale position from the previous track", () => {
    expect(progressRatio(120, 90)).toBe(1);
    expect(progressRatio(-10, 90)).toBe(0);
  });
});

describe("extrapolatePosition", () => {
  const anchor = {
    positionSec: 10,
    atMs: 1_000,
    durationSec: 100,
    playbackSpeed: 1.5,
    isPlaying: true,
  };

  it("advances with wall-clock time and playback speed", () => {
    expect(extrapolatePosition(anchor, 3_000)).toBeCloseTo(13, 6);
  });

  it("stands still while paused", () => {
    expect(extrapolatePosition({ ...anchor, isPlaying: false }, 9_000)).toBe(10);
  });

  it("never runs past the end of the track", () => {
    expect(extrapolatePosition({ ...anchor, positionSec: 99 }, 10_000)).toBe(100);
  });

  it("never runs before the start of the track", () => {
    expect(extrapolatePosition({ ...anchor, positionSec: 0 }, 3_000)).toBe(3);
    expect(extrapolatePosition({ ...anchor, playbackSpeed: -2 }, 3_000)).toBe(10);
  });

  it("ignores a clock that jumped backwards", () => {
    expect(extrapolatePosition(anchor, 500)).toBe(10);
  });
});

describe("shouldResyncToTick", () => {
  const base = {
    extrapolatedSec: 10.8,
    previousPositionSec: 9.8,
    nextPositionSec: 10.4,
    durationChanged: false,
    wasPlaying: true,
    isPlaying: true,
  };

  it("keeps extrapolating through a normal position tick", () => {
    expect(shouldResyncToTick(base)).toBe(false);
  });

  it("snaps on a backward seek", () => {
    expect(shouldResyncToTick({ ...base, nextPositionSec: 4 })).toBe(true);
  });

  it("snaps on a backward seek that is smaller than one extrapolation window", () => {
    expect(
      shouldResyncToTick({
        ...base,
        previousPositionSec: 10,
        nextPositionSec: 9,
        extrapolatedSec: 10.8,
      }),
    ).toBe(true);
  });

  it("snaps on a forward seek", () => {
    expect(shouldResyncToTick({ ...base, nextPositionSec: 24 })).toBe(true);
  });

  it("snaps when the duration changes, as on a track change", () => {
    expect(shouldResyncToTick({ ...base, durationChanged: true })).toBe(true);
  });

  it("snaps on pause and on resume", () => {
    expect(shouldResyncToTick({ ...base, isPlaying: false })).toBe(true);
    expect(shouldResyncToTick({ ...base, wasPlaying: false })).toBe(true);
  });
});

describe("nextAnchorPosition", () => {
  it("takes the tick verbatim after a resync", () => {
    expect(
      nextAnchorPosition({ resync: true, nextPositionSec: 4, extrapolatedSec: 10.8 }),
    ).toBe(4);
  });

  it("never moves the anchor backwards on a normal tick", () => {
    expect(
      nextAnchorPosition({ resync: false, nextPositionSec: 10.4, extrapolatedSec: 10.8 }),
    ).toBe(10.8);
  });
});
