/**
 * Track colour identity.
 *
 * The contract these pin is the one the design depends on: **the same seed always
 * paints the same colour**, on any device, in any session. A palette that drifted
 * between two renders would make the artwork tile and the ambient wash disagree
 * about which track is playing — which is exactly the bug the shared table was
 * introduced to remove.
 */

import { describe, expect, it } from "vitest";

import {
  AURORA,
  accentFor,
  hashString,
  luminance,
  paletteFor,
  rampGradient,
  readableOn,
  withAlpha,
} from "@/lib/palette";

describe("hashString", () => {
  it("is stable and unsigned", () => {
    expect(hashString("pejvak")).toBe(hashString("pejvak"));
    expect(hashString("pejvak")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashString("pejvak"))).toBe(true);
  });

  it("separates strings that differ by one character", () => {
    expect(hashString("chapter-1")).not.toBe(hashString("chapter-2"));
  });

  it("does not overflow into a negative number", () => {
    for (const seed of ["", "a", "a".repeat(400), "فارسی", "🙂"]) {
      expect(hashString(seed)).toBeGreaterThanOrEqual(0);
      expect(hashString(seed)).toBeLessThan(2 ** 32);
    }
  });
});

describe("paletteFor", () => {
  it("always returns a ramp from the table", () => {
    for (const seed of ["", "x", "content-hash", "persian-عنوان"]) {
      expect(AURORA).toContain(paletteFor(seed));
    }
  });

  it("is stable for the same content hash", () => {
    const first = paletteFor({ contentHash: "abc123" });
    const second = paletteFor({ contentHash: "abc123", title: "ignored" });
    expect(second).toEqual(first);
  });

  it("falls back through hash → title → id", () => {
    expect(paletteFor({ contentHash: null, title: "T", id: "i" })).toEqual(
      paletteFor("T"),
    );
    expect(paletteFor({ contentHash: null, title: null, id: "i" })).toEqual(paletteFor("i"));
  });

  it("paints the brand ramp for a seed with no identity at all", () => {
    expect(paletteFor(null)).toEqual(paletteFor("pejvak"));
    expect(paletteFor({})).toEqual(paletteFor("pejvak"));
  });

  it("spreads different tracks over more than one ramp", () => {
    const picked = new Set(
      Array.from({ length: 40 }, (_, index) => paletteFor(`track-${index}`)[0]),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it("hands the bright stop to accentFor", () => {
    expect(accentFor("abc123")).toBe(paletteFor("abc123")[1]);
  });
});

describe("withAlpha", () => {
  it("converts a hex triplet", () => {
    expect(withAlpha("#0A635C", 0.5)).toBe("rgba(10, 99, 92, 0.5)");
  });

  it("accepts a bare triplet", () => {
    expect(withAlpha("0A635C", 0)).toBe("rgba(10, 99, 92, 0)");
  });

  it("returns anything that is not a triplet untouched", () => {
    expect(withAlpha("var(--accent)", 0.4)).toBe("var(--accent)");
    expect(withAlpha("#abc", 0.4)).toBe("#abc");
  });
});

describe("luminance and readableOn", () => {
  it("ranks white above black", () => {
    expect(luminance("#FFFFFF")).toBeGreaterThan(luminance("#000000"));
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("picks a legible ink for each end of the ramp table", () => {
    expect(readableOn("#0A635C")).toBe("#FFFFFF");
    expect(readableOn("#FFD27A")).toBe("#08131A");
  });
});

describe("rampGradient", () => {
  it("runs deep → bright → shadow", () => {
    const gradient = rampGradient(AURORA[0], 160);
    expect(gradient).toContain("linear-gradient(160deg");
    expect(gradient).toContain(AURORA[0][0]);
    expect(gradient).toContain(AURORA[0][1]);
    expect(gradient).toContain(AURORA[0][2]);
  });
});
