import {
  ANNOTATION_COLORS,
  markerOffsetRatio,
  pickAnnotationColor,
} from "@/lib/annotations";

describe("markerOffsetRatio", () => {
  it("maps a position to its fraction of the track", () => {
    expect(markerOffsetRatio(30, 120)).toBe(0.25);
  });

  it("returns 0 at the start", () => {
    expect(markerOffsetRatio(0, 120)).toBe(0);
  });

  it("returns 1 at the end", () => {
    expect(markerOffsetRatio(120, 120)).toBe(1);
  });

  it("clamps positions past the end", () => {
    expect(markerOffsetRatio(150, 120)).toBe(1);
  });

  it("clamps negative positions", () => {
    expect(markerOffsetRatio(-5, 120)).toBe(0);
  });

  it("returns 0 when the duration is unknown", () => {
    expect(markerOffsetRatio(10, 0)).toBe(0);
    expect(markerOffsetRatio(10, Number.NaN)).toBe(0);
  });
});

describe("pickAnnotationColor", () => {
  it("returns palette colors in order", () => {
    expect(pickAnnotationColor(0)).toBe(ANNOTATION_COLORS[0]);
    expect(pickAnnotationColor(1)).toBe(ANNOTATION_COLORS[1]);
  });

  it("wraps around the palette", () => {
    expect(pickAnnotationColor(ANNOTATION_COLORS.length)).toBe(ANNOTATION_COLORS[0]);
  });

  it("handles negative indexes", () => {
    expect(pickAnnotationColor(-1)).toBe(ANNOTATION_COLORS[ANNOTATION_COLORS.length - 1]);
  });
});
