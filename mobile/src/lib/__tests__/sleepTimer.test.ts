import { formatRemaining, sleepDeadlineMs } from "@/lib/sleepTimer";

describe("sleepDeadlineMs", () => {
  it("adds the chosen minutes in milliseconds", () => {
    expect(sleepDeadlineMs(1_000, 5)).toBe(1_000 + 5 * 60_000);
    expect(sleepDeadlineMs(0, 60)).toBe(3_600_000);
  });
});

describe("formatRemaining", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(65_000)).toBe("1:05");
  });

  it("rounds up partial seconds so a fresh timer never shows 0:00", () => {
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(1_400)).toBe("0:02");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatRemaining(3_600_000)).toBe("1:00:00");
    expect(formatRemaining(3_661_000)).toBe("1:01:01");
  });

  it("clamps negative and non-finite input", () => {
    expect(formatRemaining(-5_000)).toBe("0:00");
    expect(formatRemaining(Number.NaN)).toBe("0:00");
  });
});
