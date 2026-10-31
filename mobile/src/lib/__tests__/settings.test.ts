import {
  DEFAULT_SETTINGS,
  DEFAULT_SHARED_SETTINGS,
  formatBytes,
  isThemePreference,
  normalizeSharedSettings,
  parseBoolean,
  parseDefaultSpeed,
  parseHistorySort,
  parseLanguageCode,
  parseMotionPreference,
} from "@/lib/settings";

describe("DEFAULT_SETTINGS", () => {
  it("defaults to the system theme, 1x speed, newest-first history, system motion, haptics on, and no language", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      themePreference: "system",
      defaultSpeed: 1,
      historySort: "newest",
      motionPreference: "system",
      hapticsEnabled: true,
      languageCode: null,
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

describe("parseMotionPreference", () => {
  it("accepts only the known preferences", () => {
    expect(parseMotionPreference("system")).toBe("system");
    expect(parseMotionPreference("full")).toBe("full");
    expect(parseMotionPreference("reduced")).toBe("reduced");
  });

  it("falls back to system for missing or unknown values", () => {
    expect(parseMotionPreference(null)).toBe("system");
    expect(parseMotionPreference("")).toBe("system");
    expect(parseMotionPreference("cinematic")).toBe("system");
  });
});

describe("parseBoolean", () => {
  it("parses the stored strings", () => {
    expect(parseBoolean("true", false)).toBe(true);
    expect(parseBoolean("false", true)).toBe(false);
  });

  it("falls back rather than treating every string as true", () => {
    expect(parseBoolean(null, true)).toBe(true);
    expect(parseBoolean("yes", false)).toBe(false);
    expect(parseBoolean("1", false)).toBe(false);
  });
});

describe("parseLanguageCode", () => {
  it("keeps a stored language code", () => {
    expect(parseLanguageCode("fa")).toBe("fa");
  });

  it("treats blank and missing values as no language", () => {
    expect(parseLanguageCode(null)).toBeNull();
    expect(parseLanguageCode("")).toBeNull();
    expect(parseLanguageCode("   ")).toBeNull();
  });
});

describe("parseDefaultSpeed", () => {
  it("accepts the player's full range, not only the settings list", () => {
    expect(parseDefaultSpeed("0.5")).toBe(0.5);
    expect(parseDefaultSpeed("1.5")).toBe(1.5);
    expect(parseDefaultSpeed("3")).toBe(3);
  });

  it("falls back to the default for missing or out-of-range values", () => {
    expect(parseDefaultSpeed(null)).toBe(1);
    expect(parseDefaultSpeed("0.1")).toBe(1);
    expect(parseDefaultSpeed("3.1")).toBe(1);
    expect(parseDefaultSpeed("nope")).toBe(1);
  });
});

describe("normalizeSharedSettings", () => {
  it("keeps valid server values", () => {
    expect(
      normalizeSharedSettings({
        languageCode: "fa",
        defaultSpeed: 2.5,
        historySort: "longest",
        updatedAt: 1000,
      }),
    ).toEqual({
      languageCode: "fa",
      defaultSpeed: 2.5,
      historySort: "longest",
      updatedAt: 1000,
    });
  });

  it("falls back per field instead of rejecting the whole response", () => {
    expect(
      normalizeSharedSettings({
        languageCode: "  ",
        defaultSpeed: 9,
        historySort: "alphabetical",
        updatedAt: 0,
      }),
    ).toEqual(DEFAULT_SHARED_SETTINGS);
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
