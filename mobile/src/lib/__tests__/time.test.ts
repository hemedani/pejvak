import {
  clampSeconds,
  digitsToSeconds,
  formatClock,
  formatRelativeTime,
} from "@/lib/time";

describe("formatClock", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(59)).toBe("0:59");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("clamps negative and fractional input", () => {
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(12.9)).toBe("0:12");
  });

  it("zero-pads a single-digit second", () => {
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(599)).toBe("9:59");
  });

  it("treats NaN as zero rather than printing NaN", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
  });
});

describe("formatRelativeTime", () => {
  const NOW = 1_700_000_000_000;
  const ago = (ms: number) => NOW - ms;

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("says Never for a sync that never happened", () => {
    // The honest answer, and the one the old `toLocaleString()` could not give:
    // it printed "Invalid Date".
    expect(formatRelativeTime(null, NOW)).toBe("Never");
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("Never");
  });

  it("does not attach a number to something that just happened", () => {
    // Rounding 20 seconds to "0 min ago" reads like a bug, and a sync that
    // finished a moment ago does not need a number attached to it.
    expect(formatRelativeTime(ago(0), NOW)).toBe("Just now");
    expect(formatRelativeTime(ago(20 * SECOND), NOW)).toBe("Just now");
    expect(formatRelativeTime(ago(44 * SECOND), NOW)).toBe("Just now");
  });

  it("counts minutes, and says '1' rather than 'one'", () => {
    expect(formatRelativeTime(ago(60 * SECOND), NOW)).toBe("1 min ago");
    expect(formatRelativeTime(ago(14 * MINUTE), NOW)).toBe("14 min ago");
  });

  it("counts hours", () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe("1 hr ago");
    expect(formatRelativeTime(ago(5 * HOUR), NOW)).toBe("5 hr ago");
  });

  it("switches to days once the distance passes a day", () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe("Yesterday");
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("3 days ago");
  });

  it("falls back to a date once the distance stops being the point", () => {
    // "23 days ago" is worse than the date: at that range the listener is
    // asking *when*, not *how long since*.
    const old = ago(20 * DAY);
    expect(formatRelativeTime(old, NOW)).toBe(new Date(old).toLocaleDateString());
  });

  it("treats a clock that moved backwards as 'Just now', not negative time", () => {
    // Device clocks do jump. "in 3 minutes" is never the right answer.
    expect(formatRelativeTime(NOW + 3 * MINUTE, NOW)).toBe("Just now");
  });
});

describe("digitsToSeconds", () => {
  it("reads the digits from the right: ss, then mm, then hh", () => {
    expect(digitsToSeconds("")).toBe(0);
    expect(digitsToSeconds("5")).toBe(5);
    expect(digitsToSeconds("90")).toBe(90);
    expect(digitsToSeconds("1234")).toBe(754);
    expect(digitsToSeconds("123456")).toBe(45296);
    expect(digitsToSeconds("000090")).toBe(90);
  });

  it("ignores anything that is not a digit", () => {
    expect(digitsToSeconds("12:34")).toBe(754);
    expect(digitsToSeconds("1a2b3c4")).toBe(754);
    expect(digitsToSeconds(" 12 34 ")).toBe(754);
  });
});

describe("clampSeconds", () => {
  it("keeps a time inside the collection", () => {
    expect(clampSeconds(500, 300)).toBe(300);
    expect(clampSeconds(0, 300)).toBe(0);
    expect(clampSeconds(120, 300)).toBe(120);
  });

  it("never returns a float or a negative", () => {
    expect(clampSeconds(12.9)).toBe(12);
    expect(clampSeconds(-4)).toBe(0);
    expect(clampSeconds(Number.NaN)).toBe(0);
  });
});
