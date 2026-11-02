/**
 * The wave's geometry.
 *
 * Three of these exist because the failure is invisible until it is on a real
 * screen: a wave that does not start and end on the centreline clips against the
 * thumb's gap, a wave with no sample cap unbounds the path on a very wide bar,
 * and a phase that travels the wrong way reads as a progress bar running
 * backwards.
 */

import { describe, expect, it } from "vitest";

import {
  WAVE_MAX_SAMPLES,
  buildWavePath,
  waveAmplitudeTarget,
  wavePhaseDelta,
} from "@/lib/waveform";

/** Every `y` in the path, in order. */
function ys(path: string): number[] {
  return [...path.matchAll(/[ML] -?[\d.]+ (-?[\d.]+)/g)].map((match) => Number(match[1]));
}

const BASE = {
  width: 300,
  centerY: 9,
  amplitude: 3,
  wavelength: 36,
  phase: 0,
};

describe("buildWavePath", () => {
  it("is a flat line when there is no amplitude", () => {
    expect(buildWavePath({ ...BASE, amplitude: 0 })).toBe("M 0 9 L 300 9");
  });

  it("is a flat line when there is nothing to draw", () => {
    expect(buildWavePath({ ...BASE, endX: 0 })).toBe("M 0 9 L 0 9");
  });

  it("starts and ends exactly on the centreline", () => {
    // The round cap has to land on the centreline at both ends, or the stroke
    // appears to grow out of the track at an angle.
    const y = ys(buildWavePath({ ...BASE, phase: 1.2 }));
    expect(y[0]).toBe(9);
    expect(y[y.length - 1]).toBe(9);
  });

  it("never exceeds the amplitude", () => {
    const y = ys(buildWavePath({ ...BASE, phase: 0.7 }));
    for (const value of y) {
      expect(Math.abs(value - 9)).toBeLessThanOrEqual(3.0001);
    }
  });

  it("honours a window", () => {
    const path = buildWavePath({ ...BASE, startX: 100, endX: 160 });
    expect(path.startsWith("M 100 ")).toBe(true);
    expect(path.endsWith("L 160 9")).toBe(true);
  });

  it("caps its sample count however wide the bar is", () => {
    const path = buildWavePath({ ...BASE, width: 20000, endX: 20000 });
    expect(path.match(/L/g)?.length ?? 0).toBeLessThanOrEqual(WAVE_MAX_SAMPLES + 1);
  });

  it("is deterministic for the same input", () => {
    expect(buildWavePath({ ...BASE, phase: 2 })).toBe(buildWavePath({ ...BASE, phase: 2 }));
  });

  it("actually waves — the middle of the path leaves the centreline", () => {
    const y = ys(buildWavePath({ ...BASE, phase: 0 }));
    expect(y.some((value) => Math.abs(value - 9) > 1)).toBe(true);
  });
});

describe("wavePhaseDelta", () => {
  it("travels to the right, so the delta is negative", () => {
    expect(wavePhaseDelta(16)).toBeLessThan(0);
  });

  it("is a full turn per period", () => {
    expect(wavePhaseDelta(1000)).toBeCloseTo(-Math.PI * 2, 10);
    expect(wavePhaseDelta(500, 1000)).toBeCloseTo(-Math.PI, 10);
  });

  it("refuses to divide by a nonsense period", () => {
    expect(wavePhaseDelta(16, 0)).toBe(0);
    expect(wavePhaseDelta(16, -1)).toBe(0);
  });
});

describe("waveAmplitudeTarget", () => {
  it("waves only while audio is moving and nobody is dragging", () => {
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: true, isScrubbing: false })).toBe(1);
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: true, isScrubbing: true })).toBe(0);
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: false, isScrubbing: false })).toBe(0);
    expect(waveAmplitudeTarget({ motionEnabled: false, isPlaying: true, isScrubbing: false })).toBe(0);
  });
});
