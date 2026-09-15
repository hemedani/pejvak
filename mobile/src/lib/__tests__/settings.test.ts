import {
  DEFAULT_SETTINGS,
  formatBytes,
  isThemePreference,
  parseDefaultSpeed,
  parseHistorySort,
} from "@/lib/settings";

describe("DEFAULT_SETTINGS", () => {
  it("defaults to the system theme, 1x speed, and newest-first history", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      themePreference: "system",
      defaultSpeed: 1,
      historySort: "newest",
    });
  });
});

describe("isThemePreference", () => {
  it("accepts only the known preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe("parseDefaultSpeed", () => {
  it("returns the stored speed when valid", () => {
    expect(parseDefaultSpeed("1.5")).toBe(1.5);
  });

  it("falls back to the default for missing or off-list values", () => {
    expect(parseDefaultSpeed(null)).toBe(1);
    expect(parseDefaultSpeed("3")).toBe(1);
    expect(parseDefaultSpeed("nope")).toBe(1);
  });
});

describe("parseHistorySort", () => {
  it("accepts every offered sort", () => {
    expect(parseHistorySort("newest")).toBe("newest");
    expect(parseHistorySort("oldest")).toBe("oldest");
    expect(parseHistorySort("longest")).toBe("longest");
  });

  it("falls back to newest for missing or unknown values", () => {
    expect(parseHistorySort(null)).toBe("newest");
    expect(parseHistorySort("")).toBe("newest");
    expect(parseHistorySort("alphabetical")).toBe("newest");
  });
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});
