import {
  ANY_DATE,
  describeDateRange,
  formatDateInput,
  isRangeActive,
  presetForRange,
  presetRange,
  rangeContains,
  startOfDay,
} from "@/lib/dateRange";

/** A fixed local noon, so a test never straddles midnight. */
const NOON = new Date(2026, 2, 9, 12, 0, 0, 0).getTime();

describe("presetRange", () => {
  it("counts today as one of the rolling days", () => {
    const week = presetRange("week", NOON);
    expect(week.from).toBe(startOfDay(NOON - 6 * 24 * 60 * 60 * 1000));
    expect(week.to).toBe(new Date(2026, 2, 9, 23, 59, 59, 999).getTime());
  });

  it("has no bounds for any date", () => {
    expect(presetRange("any", NOON)).toEqual(ANY_DATE);
    expect(isRangeActive(presetRange("any", NOON))).toBe(false);
  });

  it("starts this year on 1 January", () => {
    expect(presetRange("year", NOON).from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
  });
});

describe("rangeContains", () => {
  const today = presetRange("today", NOON);

  it("includes the last millisecond of the day", () => {
    expect(rangeContains(today, new Date(2026, 2, 9, 23, 59, 59, 999).getTime())).toBe(true);
  });

  it("excludes the next day", () => {
    expect(rangeContains(today, new Date(2026, 2, 10, 0, 0, 0, 0).getTime())).toBe(false);
  });

  it("treats a missing bound as open", () => {
    expect(rangeContains({ from: startOfDay(NOON), to: null }, NOON + 10 ** 10)).toBe(true);
    expect(rangeContains({ from: null, to: startOfDay(NOON) }, NOON - 10 ** 10)).toBe(true);
  });
});

describe("describeDateRange", () => {
  it("names a single day once", () => {
    const range = { from: startOfDay(NOON), to: startOfDay(NOON) };
    expect(describeDateRange(range, NOON)).toBe("9 Mar");
  });

  it("names both ends of a span", () => {
    const range = presetRange("week", NOON);
    expect(describeDateRange(range, NOON)).toBe("3 Mar – 9 Mar");
  });

  it("says Any date for an empty range", () => {
    expect(describeDateRange(ANY_DATE, NOON)).toBe("Any date");
  });

  it("keeps the year when it is not this one", () => {
    const lastYear = new Date(2025, 11, 30, 12).getTime();
    expect(describeDateRange({ from: lastYear, to: lastYear }, NOON)).toBe("30 Dec 2025");
  });
});

describe("presetForRange", () => {
  it("recognises a preset it produced", () => {
    expect(presetForRange(presetRange("month", NOON), NOON)).toBe("month");
  });

  it("calls anything else custom", () => {
    const odd = { from: new Date(2026, 1, 2).getTime(), to: null };
    expect(presetForRange(odd, NOON)).toBe("custom");
  });
});

describe("formatDateInput", () => {
  it("round-trips a day", () => {
    expect(formatDateInput(startOfDay(NOON))).toBe("2026-03-09");
  });
});
