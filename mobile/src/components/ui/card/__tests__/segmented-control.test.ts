import { readFileSync } from "node:fs";
import path from "node:path";

import { thumbOffsetRatio, thumbTargetPercent } from "@/lib/segmentedLayout";

/**
 * Where the segmented control's thumb actually lands.
 *
 * `translateX` on an absolutely-positioned view is a percentage of **that view's
 * own width** — and the thumb is one segment wide, not the whole track. An earlier
 * version applied a normalised 0–1 progress straight to it, so the thumb moved
 * `1 / (count - 1)` of the distance it should have: on the five-option playback
 * speed the thumb sat inside the *first* segment while the second was selected,
 * which read as "the active status moves to the left".
 */

/**
 * The offset the thumb's left edge ends up at, as a fraction of the track.
 *
 * The thumb is `1 / count` of the track, so a translate of P% lands it
 * P/100/count of the way across.
 */
function offsetRatioFor(index: number, count: number): number {
  return thumbTargetPercent(index, count) / 100 / count;
}

describe("thumbTargetPercent", () => {
  it("lands the thumb on the segment it names", () => {
    // The property that matters: segment `index` owns the slice of the track from
    // `index / count` to `(index + 1) / count`, and the thumb's left edge must sit
    // exactly on that boundary.
    for (const count of [2, 3, 4, 5, 6]) {
      for (let index = 0; index < count; index += 1) {
        expect(offsetRatioFor(index, count)).toBeCloseTo(index / count, 6);
      }
    }
  });

  it("agrees with the offset a segment actually owns", () => {
    for (const count of [3, 5]) {
      for (let index = 0; index < count; index += 1) {
        expect(offsetRatioFor(index, count)).toBeCloseTo(
          thumbOffsetRatio(index, count),
          6,
        );
      }
    }
  });

  it("does not move at all for the first segment", () => {
    expect(thumbTargetPercent(0, 5)).toBe(0);
  });

  it("moves the full travel for the last segment", () => {
    // Four segments of a five-option control, each one thumb-width.
    expect(thumbTargetPercent(4, 5)).toBe(400);
    expect(thumbTargetPercent(2, 3)).toBe(200);
  });

  it("stays put rather than dividing by zero on a single option", () => {
    expect(thumbTargetPercent(0, 1)).toBe(0);
    expect(thumbTargetPercent(1, 1)).toBe(0);
  });

  it("clamps an index outside the range rather than throwing", () => {
    // A value that is no longer in `options` must not throw mid-render.
    expect(thumbTargetPercent(-1, 5)).toBe(0);
    expect(thumbTargetPercent(9, 5)).toBe(400);
  });
});

describe("thumbOffsetRatio", () => {
  it("starts on the track's leading edge", () => {
    expect(thumbOffsetRatio(0, 5)).toBe(0);
  });

  it("puts the last segment's thumb one thumb-width short of the end", () => {
    // The thumb can never be flush with the trailing edge, or it would hang over.
    expect(thumbOffsetRatio(4, 5)).toBeCloseTo(0.8, 6);
  });
});

describe("the worklet boundary", () => {
  it("keeps the segment conversion out of the component's worklet", () => {
    // A worklet body runs on the UI thread, where a plain function imported from
    // another module is a *Remote Function* and calling it throws synchronously.
    // That is why the conversion lives here and the shared value already holds a
    // translate: the worklet then only interpolates one number into a string.
    //
    // This reads the component as text, because the failure is invisible to both
    // the type checker and every unit test — it only happens on a device.
    const source = readFileSync(
      path.join(process.cwd(), "src/components/ui/card/segmented-control.tsx"),
      "utf8",
    );
    const workletBodies =
      source.match(/useAnimatedStyle\([\s\S]*?\n  \}\)\);/g) ?? [];
    expect(workletBodies.length).toBeGreaterThan(0);
    for (const body of workletBodies) {
      expect(body).not.toMatch(
        /thumbTargetPercent|thumbOffsetRatio|thumbTranslatePercent/,
      );
    }
  });
});
