/**
 * Formatting, in Persian.
 *
 * Two of these tests exist because the bug they catch is invisible until it is
 * embarrassing: `formatSpan` returning `۰ دقیقه` for a listener who has listened
 * for forty seconds (reads as "you have never listened"), and `formatBytes`
 * putting a Latin full stop inside a Persian number (reads as the end of the
 * sentence).
 */

import { describe, expect, it } from "vitest";

import {
  fa,
  faNumber,
  formatBytes,
  formatClockFa,
  formatCount,
  formatPercent,
  formatSpan,
  formatSpeed,
  truncate,
} from "@/lib/format";

describe("fa", () => {
  it("converts ASCII digits and nothing else", () => {
    expect(fa("1403")).toBe("۱۴۰۳");
    expect(fa(42)).toBe("۴۲");
    expect(fa("a1-b2")).toBe("a۱-b۲");
    expect(fa("کتاب ۲")).toBe("کتاب ۲");
  });
});

describe("faNumber", () => {
  it("uses Persian digits and a Persian group separator", () => {
    const text = faNumber(12345);
    expect(text).not.toMatch(/[0-9]/);
    expect(text).not.toContain(",");
  });
});

describe("formatSpan", () => {
  it("never says «۰ دقیقه»", () => {
    expect(formatSpan(0)).toBe("بدون شنیدن");
    expect(formatSpan(40)).toBe("کمتر از یک دقیقه");
  });

  it("drops the hours until there is one", () => {
    expect(formatSpan(60)).toBe("۱ دقیقه");
    expect(formatSpan(59 * 60)).toBe("۵۹ دقیقه");
  });

  it("states hours and minutes, and drops minutes past ten hours", () => {
    expect(formatSpan(3600)).toBe("۱ ساعت");
    expect(formatSpan(3600 + 60)).toBe("۱ ساعت و ۱ دقیقه");
    expect(formatSpan(2 * 3600)).toBe("۲ ساعت");
    // At this scale the minutes are noise and the cell must stay one line.
    expect(formatSpan(10 * 3600 + 5 * 60)).toBe("۱۰ ساعت");
  });

  it("survives nonsense", () => {
    expect(formatSpan(Number.NaN)).toBe("بدون شنیدن");
    expect(formatSpan(-100)).toBe("بدون شنیدن");
  });
});

describe("formatClockFa", () => {
  it("formats like formatClock, in Persian digits", () => {
    expect(formatClockFa(0)).toBe("۰:۰۰");
    expect(formatClockFa(61)).toBe("۱:۰۱");
    expect(formatClockFa(3661)).toBe("۱:۰۱:۰۱");
  });
});

describe("formatBytes", () => {
  it("steps up through the units", () => {
    expect(formatBytes(512)).toBe("۵۱۲ بایت");
    expect(formatBytes(1536)).toBe("۱٫۵ کیلوبایت");
  });

  it("keeps one decimal below ten and none above", () => {
    expect(formatBytes(1024 * 1024 * 15)).toBe("۱۵ مگابایت");
  });

  it("uses the Persian decimal separator, not a full stop", () => {
    // `1.5` inside a Persian sentence reads as the end of that sentence.
    const text = formatBytes(1536);
    expect(text).not.toContain(".");
    expect(text).toContain("٫");
  });
});

describe("formatPercent", () => {
  it("clamps and rounds", () => {
    expect(formatPercent(0.42)).toBe("۴۲٪");
    expect(formatPercent(1.4)).toBe("۱۰۰٪");
    expect(formatPercent(-1)).toBe("۰٪");
  });
});

describe("formatCount", () => {
  it("does not pluralise a Persian noun after a number", () => {
    expect(formatCount(3, "کتاب")).toBe("۳ کتاب");
    expect(formatCount(0, "ترک")).toBe("۰ ترک");
  });
});

describe("formatSpeed", () => {
  it("drops the decimal on a whole speed", () => {
    expect(formatSpeed(2)).toBe("۲×");
    expect(formatSpeed(1)).toBe("۱×");
  });

  it("uses the Persian decimal separator, not a full stop", () => {
    expect(formatSpeed(1.5)).toBe("۱٫۵×");
    expect(formatSpeed(1.44)).toBe("۱٫۴×");
  });

  it("treats a missing or impossible speed as 1×", () => {
    // A row recorded before the phone sent the field decodes as 1, not 0 — and
    // `۰×` beside a session would read as "paused".
    expect(formatSpeed(0)).toBe("۱×");
    expect(formatSpeed(Number.NaN)).toBe("۱×");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("کتاب", 10)).toBe("کتاب");
  });

  it("cuts at a word boundary and marks the cut", () => {
    const text = truncate("تاریخ ایران در قرن بیستم", 16);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(17);
  });
});
