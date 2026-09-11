import { formatClock } from "@/lib/time";

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
});
