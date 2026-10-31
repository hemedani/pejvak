/**
 * The shared preferences, as read off the wire.
 *
 * One rule is worth locking here and it is the reason the parser exists: **each
 * field falls back on its own.** A whole-object fallback would be simpler and
 * would silently discard two preferences because a third arrived unrecognised —
 * the listener would change their language and watch their history order revert
 * to newest, with nothing on screen to explain it.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHARED_SETTINGS,
  parseDefaultSpeed,
  parseHistorySort,
  parseLanguageCode,
  parseSettings,
  SPEED_OPTIONS,
} from "../domain/settings";

describe("parseSettings", () => {
  it("reads a complete row", () => {
    expect(
      parseSettings({
        languageCode: "fa",
        defaultSpeed: 1.25,
        historySort: "oldest",
        updatedAt: 1_700_000_000_000,
      }),
    ).toEqual({
      languageCode: "fa",
      defaultSpeed: 1.25,
      historySort: "oldest",
      updatedAt: 1_700_000_000_000,
    });
  });

  it("falls back per field, not per object", () => {
    // One unknown language must not take the other two choices with it.
    expect(
      parseSettings({ languageCode: 42, defaultSpeed: 1.5, historySort: "longest" }),
    ).toMatchObject({
      languageCode: null,
      defaultSpeed: 1.5,
      historySort: "longest",
    });
  });

  it("answers a missing or non-record payload with the defaults", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SHARED_SETTINGS);
    expect(parseSettings("nonsense")).toEqual(DEFAULT_SHARED_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SHARED_SETTINGS);
  });

  it("reads an ISO timestamp as well as an epoch number", () => {
    const iso = "2026-10-31T09:00:00.000Z";
    expect(parseSettings({ updatedAt: iso }).updatedAt).toBe(Date.parse(iso));
  });
});

describe("parseLanguageCode", () => {
  it("treats blank and whitespace as no choice", () => {
    // The backend stores null for "none", and `""` is how a clear is sent.
    expect(parseLanguageCode("")).toBeNull();
    expect(parseLanguageCode("   ")).toBeNull();
    expect(parseLanguageCode(null)).toBeNull();
  });

  it("lower-cases a code, because the catalogue's are lower-case", () => {
    expect(parseLanguageCode(" FA ")).toBe("fa");
  });

  it("keeps a code the catalogue no longer lists", () => {
    // Membership is decided where the language is used. A removed source must
    // stop offering its shortcut, not turn a settings read into an error.
    expect(parseLanguageCode("xx")).toBe("xx");
  });
});

describe("parseDefaultSpeed", () => {
  it("keeps every rate the backend validates", () => {
    expect(parseDefaultSpeed(0.5)).toBe(0.5);
    expect(parseDefaultSpeed(1.75)).toBe(1.75);
    expect(parseDefaultSpeed(3)).toBe(3);
  });

  it("falls back outside the range rather than clamping", () => {
    // Clamping would invent a preference: 4× silently becoming 3× is a rate the
    // listener never chose and cannot tell apart from the one they did.
    expect(parseDefaultSpeed(0.2)).toBe(DEFAULT_SHARED_SETTINGS.defaultSpeed);
    expect(parseDefaultSpeed(4)).toBe(DEFAULT_SHARED_SETTINGS.defaultSpeed);
    expect(parseDefaultSpeed(null)).toBe(DEFAULT_SHARED_SETTINGS.defaultSpeed);
  });
});

describe("parseHistorySort", () => {
  it("accepts the three orders and nothing else", () => {
    expect(parseHistorySort("oldest")).toBe("oldest");
    expect(parseHistorySort("longest")).toBe("longest");
    expect(parseHistorySort("sideways")).toBe(DEFAULT_SHARED_SETTINGS.historySort);
    expect(parseHistorySort(null)).toBe(DEFAULT_SHARED_SETTINGS.historySort);
  });
});

describe("SPEED_OPTIONS", () => {
  it("is the phone's settings list, inside the range the backend accepts", () => {
    // Narrower than the player's menu on purpose (see `domain/settings.ts`): a
    // default the phone's own settings screen cannot display would show there as
    // "nothing chosen".
    expect(SPEED_OPTIONS).toEqual([0.75, 1, 1.25, 1.5, 2]);
    for (const speed of SPEED_OPTIONS) {
      expect(parseDefaultSpeed(speed)).toBe(speed);
    }
  });
});
