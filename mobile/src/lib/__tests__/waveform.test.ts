import {
  buildWavePath,
  WAVE_MAX_SAMPLES,
  waveAmplitudeTarget,
  wavePhaseDelta,
} from "@/lib/waveform";

type Point = { x: number; y: number };

function parsePoints(d: string): Point[] {
  return [...d.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function path(overrides: Partial<Parameters<typeof buildWavePath>[0]> = {}): string {
  return buildWavePath({
    width: 240,
    centerY: 10,
    amplitude: 3,
    wavelength: 36,
    phase: 1.1,
    ...overrides,
  });
}

describe("buildWavePath", () => {
  it("starts and ends on the centerline", () => {
    const points = parsePoints(path());

    expect(points[0]).toEqual({ x: 0, y: 10 });
    expect(points[points.length - 1]).toEqual({ x: 240, y: 10 });
  });

  it("never strays further than the amplitude from the centerline", () => {
    for (const point of parsePoints(path())) {
      expect(Math.abs(point.y - 10)).toBeLessThanOrEqual(3.0001);
    }
  });

  it("draws a straight line at zero amplitude", () => {
    expect(path({ amplitude: 0 })).toBe("M 0 10 L 240 10");
  });

  it("ends exactly at the supplied end point and never draws past it", () => {
    const points = parsePoints(path({ endX: 100 }));

    expect(points[points.length - 1].x).toBe(100);
    expect(points.every((point) => point.x <= 100)).toBe(true);
    expect(points[points.length - 1].y).toBe(10);
  });

  it("tapers to the centerline so the stroke cannot hit the thumb", () => {
    const points = parsePoints(path());
    const nearStart = points.find((point) => point.x >= 2 && point.x <= 4);
    const nearEnd = points.find((point) => point.x >= 236 && point.x < 240);

    expect(nearStart).toBeDefined();
    expect(nearEnd).toBeDefined();
    expect(Math.abs((nearStart as Point).y - 10)).toBeLessThanOrEqual(0.35);
    expect(Math.abs((nearEnd as Point).y - 10)).toBeLessThanOrEqual(0.35);
  });

  it("changes shape as the phase advances", () => {
    const a = parsePoints(path({ phase: 0, endX: 120 }));
    const b = parsePoints(path({ phase: Math.PI / 2, endX: 120 }));

    expect(a.map((point) => point.y)).not.toEqual(b.map((point) => point.y));
  });

  it("caps the sample count on a very long, very short-wave bar", () => {
    const points = parsePoints(
      path({ width: 4000, endX: 4000, wavelength: 8, centerY: 4 }),
    );

    expect(points.length).toBeLessThanOrEqual(WAVE_MAX_SAMPLES + 2);
  });

  it("collapses to nothing when the wave has no room to run", () => {
    expect(path({ endX: 0 })).toBe("M 0 10 L 0 10");
    expect(path({ endX: -20 })).toBe("M 0 10 L 0 10");
  });
});

describe("waveAmplitudeTarget", () => {
  it("is full only while playing, untouched and motion is enabled", () => {
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: true, isScrubbing: false })).toBe(1);
  });

  it("flattens when paused", () => {
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: false, isScrubbing: false })).toBe(0);
  });

  it("flattens under the finger", () => {
    expect(waveAmplitudeTarget({ motionEnabled: true, isPlaying: true, isScrubbing: true })).toBe(0);
  });

  it("flattens when the system asks for reduced motion", () => {
    expect(waveAmplitudeTarget({ motionEnabled: false, isPlaying: true, isScrubbing: false })).toBe(0);
  });
});

describe("wavePhaseDelta", () => {
  it("travels one wavelength per second toward the right", () => {
    expect(wavePhaseDelta(1000)).toBeCloseTo(-2 * Math.PI, 10);
    expect(wavePhaseDelta(500)).toBeCloseTo(-Math.PI, 10);
    expect(wavePhaseDelta(0)).toBeCloseTo(0, 10);
  });

  it("scales with the requested period", () => {
    expect(wavePhaseDelta(1000, 2000)).toBeCloseTo(-Math.PI, 10);
  });
});
