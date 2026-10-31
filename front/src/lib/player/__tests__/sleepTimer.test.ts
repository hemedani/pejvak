import { describe, expect, it } from "vitest";

import { formatRemaining, sleepDeadlineMs } from "../sleepTimer";

describe("sleep timer", () => {
  it("is a deadline, not a decrementing counter", () => {
    expect(sleepDeadlineMs(1_000, 15)).toBe(1_000 + 15 * 60_000);
  });

  it("formats minutes and seconds, rounded up", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(90_000)).toBe("1:30");
    expect(formatRemaining(3_600_000)).toBe("1:00:00");
  });

  it("never shows a negative clock", () => {
    expect(formatRemaining(-5000)).toBe("0:00");
  });
});
