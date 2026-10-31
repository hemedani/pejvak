/**
 * Formatting, in English.
 *
 * The app is English-only (D10) because the product ships to the global store,
 * so these tests pin the English contract: Latin digits, English unit words, a
 * full stop as the decimal separator, and `en-US` grouping whatever the machine's
 * locale happens to be.
 *
 * Two of them exist because the bug they catch is invisible until it is
 * embarrassing: `formatSpan` returning `"0 min"` for a listener who has listened
 * for forty seconds (reads as "you have never listened"), and a number formatted
 * with the runtime locale, which renders `12.345` on one machine and `12,345` on
 * another.
 */

import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCount,
  formatNumber,
  formatPercent,
  formatSpan,
  formatSpeed,
  truncate,
} from "@/lib/format";

describe("formatNumber", () => {
  it("groups with a comma", () => {
    expect(formatNumber(12345)).toBe("12,345");
    expect(formatNumber(999)).toBe("999");
  });

  it("uses Latin digits and never Persian ones", () => {
    const text = formatNumber(1403);
    expect(text).toBe("1,403");
    expect(text).not.toMatch(/[۰-۹٠-٩]/);
  });

  it("treats a non-finite value as zero", () => {
    expect(formatNumber(Number.NaN)).toBe("0");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("formatSpan", () => {
  it("never says «0 min»", () => {
    expect(formatSpan(0)).toBe("No listening");
    expect(formatSpan(40)).toBe("Under a minute");
  });

  it("drops the hours until there is one", () => {
    expect(formatSpan(60)).toBe("1 min");
    expect(formatSpan(59 * 60)).toBe("59 min");
  });

  it("states hours and minutes, and drops minutes past ten hours", () => {
    expect(formatSpan(3600)).toBe("1 hr");
    expect(formatSpan(3600 + 60)).toBe("1 hr 1 min");
    expect(formatSpan(2 * 3600)).toBe("2 hr");
    // At this scale the minutes are noise and the cell must stay one line.
    expect(formatSpan(10 * 3600 + 5 * 60)).toBe("10 hr");
  });

  it("survives nonsense", () => {
    expect(formatSpan(Number.NaN)).toBe("No listening");
    expect(formatSpan(-100)).toBe("No listening");
  });
});

describe("formatBytes", () => {
  it("steps up through the units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("keeps one decimal below ten and none above", () => {
    expect(formatBytes(1024 * 1024 * 15)).toBe("15 MB");
  });

  it("uses a full stop as the decimal separator", () => {
    expect(formatBytes(1536)).toContain(".");
  });
});

describe("formatPercent", () => {
  it("clamps and rounds", () => {
    expect(formatPercent(0.42)).toBe("42%");
    expect(formatPercent(1.4)).toBe("100%");
    expect(formatPercent(-1)).toBe("0%");
  });
});

describe("formatCount", () => {
  it("inflects the noun for English", () => {
    expect(formatCount(3, "track")).toBe("3 tracks");
    expect(formatCount(0, "track")).toBe("0 tracks");
    expect(formatCount(1, "track")).toBe("1 track");
  });

  it("takes an irregular plural", () => {
    expect(formatCount(1, "series", "series")).toBe("1 series");
    expect(formatCount(2, "series", "series")).toBe("2 series");
  });

  it("groups a large count", () => {
    expect(formatCount(1200, "track")).toBe("1,200 tracks");
  });
});

describe("formatSpeed", () => {
  it("drops the decimal on a whole speed", () => {
    expect(formatSpeed(2)).toBe("2×");
    expect(formatSpeed(1)).toBe("1×");
  });

  it("keeps one decimal on a fractional speed", () => {
    expect(formatSpeed(1.5)).toBe("1.5×");
    expect(formatSpeed(1.44)).toBe("1.4×");
  });

  it("treats a missing or impossible speed as 1×", () => {
    // A row recorded before the phone sent the field decodes as 1, not 0 — and
    // `0×` beside a session would read as "paused".
    expect(formatSpeed(0)).toBe("1×");
    expect(formatSpeed(Number.NaN)).toBe("1×");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("History", 10)).toBe("History");
  });

  it("cuts at a word boundary and marks the cut", () => {
    const text = truncate("A history of Iran in the twentieth century", 16);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(17);
  });
});
