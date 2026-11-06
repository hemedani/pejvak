import {
  ANY_DATE,
  describeDateRange,
  formatDateInput,
  formatDateTyping,
  isRangeActive,
  parseDateInput,
  presetForRange,
  presetRange,
  rangeContains,
  rangeFromInputs,
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

describe("parseDateInput", () => {
  it("reads a dashed date as the start of that day", () => {
    expect(parseDateInput("2026-03-09")).toEqual({ value: startOfDay(NOON), error: null });
  });

  it("reads slashes and Persian digits", () => {
    expect(parseDateInput("۲۰۲۶/۰۳/۰۹").value).toBe(startOfDay(NOON));
  });

  it("rejects a day that does not exist rather than rolling it over", () => {
    expect(parseDateInput("2026-02-31").value).toBeNull();
    expect(parseDateInput("2026-02-31").error).not.toBeNull();
  });

  it("treats an empty field as no bound, not as an error", () => {
    expect(parseDateInput("  ")).toEqual({ value: null, error: null });
  });
});

describe("rangeFromInputs", () => {
  it("makes the end inclusive", () => {
    const { range } = rangeFromInputs("2026-03-01", "2026-03-09");
    expect(range.from).toBe(new Date(2026, 2, 1).getTime());
    expect(range.to).toBe(new Date(2026, 2, 9, 23, 59, 59, 999).getTime());
  });

  it("refuses a backwards range", () => {
    const { range, error } = rangeFromInputs("2026-03-09", "2026-03-01");
    expect(range).toEqual(ANY_DATE);
    expect(error).toMatch(/after/);
  });

  it("leaves one end open when only one is typed", () => {
    const { range } = rangeFromInputs("2026-03-01", "");
    expect(range.from).toBe(new Date(2026, 2, 1).getTime());
    expect(range.to).toBeNull();
  });
});

describe("formatDateInput", () => {
  it("round-trips a day", () => {
    expect(formatDateInput(startOfDay(NOON))).toBe("2026-03-09");
  });
});

describe("formatDateTyping", () => {
  it("supplies the separators a numeric keypad cannot type", () => {
    expect(formatDateTyping("2026")).toBe("2026");
    expect(formatDateTyping("20260")).toBe("2026-0");
    expect(formatDateTyping("202603")).toBe("2026-03");
    expect(formatDateTyping("2026030")).toBe("2026-03-0");
    expect(formatDateTyping("20260309")).toBe("2026-03-09");
  });

  it("ignores anything that is not a digit or a separator", () => {
    expect(formatDateTyping("2026/03/09")).toBe("2026-03-09");
    expect(formatDateTyping("2026 03 09")).toBe("2026-03-09");
    expect(formatDateTyping("2026-03-09extra")).toBe("2026-03-09");
  });

  it("stops at eight digits", () => {
    expect(formatDateTyping("202603091234")).toBe("2026-03-09");
  });

  it("shortens the date when the keypress removed a separator", () => {
    // Backspace on the dash of "2026-03" leaves "202603"; the dash must not
    // simply come back, or the key would look dead.
    expect(formatDateTyping("202603", "2026-03")).toBe("2026-0");
    expect(formatDateTyping("202603", "2026/03")).toBe("2026-0");
  });

  it("treats a digit deletion as one", () => {
    expect(formatDateTyping("2026-0", "2026-03")).toBe("2026-0");
    expect(formatDateTyping("2026-03-0", "2026-03-09")).toBe("2026-03-0");
  });

  it("clears back to nothing", () => {
    expect(formatDateTyping("", "2")).toBe("");
  });
});

describe("parseDateInput with compact digits", () => {
  it("reads the eight digits the numeric keypad produces", () => {
    expect(parseDateInput("20260309")).toEqual({ value: startOfDay(NOON), error: null });
  });

  it("still rejects an impossible compact day", () => {
    expect(parseDateInput("20260231").error).not.toBeNull();
  });
});
