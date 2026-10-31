import { describe, expect, it } from "vitest";

import {
  ANNOTATION_COLORS,
  markerOffsetRatio,
  normalizeAnnotationColor,
  pickAnnotationColor,
} from "../annotations";

describe("annotation markers", () => {
  it("positions a note as a fraction of the track", () => {
    expect(markerOffsetRatio(30, 120)).toBe(0.25);
    expect(markerOffsetRatio(0, 120)).toBe(0);
  });

  it("clamps a stale or unknown position", () => {
    expect(markerOffsetRatio(300, 120)).toBe(1);
    expect(markerOffsetRatio(-5, 120)).toBe(0);
    expect(markerOffsetRatio(30, 0)).toBe(0);
    expect(markerOffsetRatio(Number.NaN, 120)).toBe(0);
  });
});

describe("annotation colours", () => {
  it("cycles the six-colour palette", () => {
    expect(pickAnnotationColor(0)).toBe(ANNOTATION_COLORS[0]);
    expect(pickAnnotationColor(6)).toBe(ANNOTATION_COLORS[0]);
    expect(pickAnnotationColor(-1)).toBe(ANNOTATION_COLORS[5]);
  });

  it("keeps a known colour and replaces an unknown one", () => {
    expect(normalizeAnnotationColor("#E5484D", 0)).toBe("#E5484D");
    expect(normalizeAnnotationColor("red", 2)).toBe(ANNOTATION_COLORS[2]);
    expect(normalizeAnnotationColor(null, 3)).toBe(ANNOTATION_COLORS[3]);
  });
});
