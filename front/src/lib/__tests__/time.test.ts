/**
 * Time, and the arithmetic the whole product is built on.
 *
 * `formatClock`, `digitsToSeconds` and `clampSeconds` are ports, and their
 * expectations are copied with them: the phone and the browser must agree about
 * what `"1234"` means and about where an hour starts, or a history recorded on
 * one and read on the other disagrees with itself.
 */

import { describe, expect, it } from "vitest";

import {
  clampSeconds,
  digitsToSeconds,
  formatClock,
  formatRelativeTime,
  startOfDay,
  toAsciiDigits,
} from "@/lib/time";

describe("formatClock", () => {
  it("drops the hour until there is one", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(3599)).toBe("59:59");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("floors a fractional second rather than rounding it up", () => {
    // A scrubber reports `currentTime` as a float. Rounding 0.9 up to 1 would
    // make the clock tick a second early, once per second.
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("survives nonsense instead of printing NaN", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("handles an audiobook longer than a day", () => {
    expect(formatClock(24 * 3600 + 61)).toBe("24:01:01");
  });
});

describe("digitsToSeconds", () => {
  it("reads from the right, smallest unit first", () => {
    expect(digitsToSeconds("5")).toBe(5);
    expect(digitsToSeconds("90")).toBe(90);
    expect(digitsToSeconds("1234")).toBe(12 * 60 + 34);
    expect(digitsToSeconds("123456")).toBe(12 * 3600 + 34 * 60 + 56);
  });

  it("ignores separators, so a pasted timecode still works", () => {
    expect(digitsToSeconds("12:34")).toBe(12 * 60 + 34);
    expect(digitsToSeconds("1:02:03")).toBe(3600 + 2 * 60 + 3);
    expect(digitsToSeconds("1a2b3c4")).toBe(12 * 60 + 34);
  });

  it("accepts Persian and Arabic-Indic digits", () => {
    // A listener typing on a Persian keyboard produces these, and `\D` alone
    // would strip every one of them and return 0.
    expect(digitsToSeconds("۱۲۳۴")).toBe(12 * 60 + 34);
    expect(digitsToSeconds("١٢٣٤")).toBe(12 * 60 + 34);
  });

  it("is 0 for empty input rather than NaN", () => {
    expect(digitsToSeconds("")).toBe(0);
    expect(digitsToSeconds("abc")).toBe(0);
  });

  it("keeps the last six digits, dropping the overflow from the left", () => {
    expect(digitsToSeconds("000090")).toBe(90);
    // Seven digits: the first is dropped, so this reads as 99:12:34. The
    // alternative — reading it as 999 hours — is not a timecode anyone types.
    expect(digitsToSeconds("9991234")).toBe(99 * 3600 + 12 * 60 + 34);
  });
});

describe("clampSeconds", () => {
  it("clamps to zero and to a whole second", () => {
    expect(clampSeconds(-3)).toBe(0);
    expect(clampSeconds(4.7)).toBe(4);
  });

  it("honours the upper bound when there is one", () => {
    expect(clampSeconds(90, 60)).toBe(60);
    expect(clampSeconds(30, 60)).toBe(30);
    expect(clampSeconds(30)).toBe(30);
  });
});

describe("toAsciiDigits", () => {
  it("maps both digit systems and leaves everything else alone", () => {
    expect(toAsciiDigits("۱۲۳")).toBe("123");
    expect(toAsciiDigits("١٢٣")).toBe("123");
    expect(toAsciiDigits("a۱b")).toBe("a1b");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 9, 30, 12, 0, 0).getTime();

  it("says «Just now» for the last 45 seconds and for a future timestamp", () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe("Just now");
    // A clock that is behind is a clock change, not negative time ago.
    expect(formatRelativeTime(now + 60_000, now)).toBe("Just now");
  });

  it("matches the phone word for word", () => {
    // The two apps must not disagree about the same event: a listener who
    // installs both should read "3 hr ago" on either. These are the phone's
    // exact strings (`mobile/src/lib/time.ts`), not a paraphrase of them.
    expect(formatRelativeTime(now - 60_000, now)).toBe("1 min ago");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe("3 hr ago");
    expect(formatRelativeTime(now - 24 * 3600_000, now)).toBe("Yesterday");
    expect(formatRelativeTime(now - 3 * 24 * 3600_000, now)).toBe("3 days ago");
  });

  it("uses Latin digits, never Persian ones", () => {
    const text = formatRelativeTime(now - 3 * 3600_000, now);
    expect(text).not.toMatch(/[۰-۹٠-٩]/);
  });

  it("falls back to a date after a week", () => {
    const text = formatRelativeTime(now - 30 * 24 * 3600_000, now);
    expect(text).toBe("September 30, 2026");
    expect(text).not.toMatch(/ago/);
  });

  it("says «Never» for a null timestamp", () => {
    expect(formatRelativeTime(null, now)).toBe("Never");
  });
});

describe("startOfDay", () => {
  it("returns local midnight", () => {
    const noon = new Date(2026, 9, 30, 12, 34, 56).getTime();
    const midnight = new Date(startOfDay(noon));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getDate()).toBe(30);
  });
});
