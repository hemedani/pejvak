/**
 * The tone curve and the room-tone level as data.
 *
 * These cases are about the numbers a listener's drag produces: they must be
 * clamped, snapped, and never lose the other two bands because one arrived
 * unreadable. The wording is pinned too, because "Off" and "+0.0 dB" are the
 * same value and only one of them is true.
 */

import { TONE_TARGET_RMS_DB } from "@/lib/ambientTones";
import {
  DEFAULT_ENHANCER,
  ENHANCER_RANGE,
  describeGainDb,
  describeLevel,
  describeRoomTone,
  isEnhancerActive,
  isEnhancerFlat,
  normalizeEnhancer,
  normalizeRoomTone,
  normalizeVolume,
  parseEnhancer,
  patchEnhancer,
  roomToneAmplitude,
  serializeEnhancer,
  volumeAmplitude,
} from "@/lib/audioEffects";

describe("normalizeEnhancer", () => {
  it("clamps each band to its own range", () => {
    expect(normalizeEnhancer({ boostDb: 99, bassDb: -99, trebleDb: 4 })).toEqual({
      enabled: false,
      boostDb: ENHANCER_RANGE.boostDb.max,
      bassDb: ENHANCER_RANGE.bassDb.min,
      trebleDb: 4,
    });
  });

  it("snaps to the half-decibel step", () => {
    expect(normalizeEnhancer({ bassDb: 3.26 }).bassDb).toBe(3.5);
    expect(normalizeEnhancer({ bassDb: 3.24 }).bassDb).toBe(3);
  });

  it("keeps a boost from going negative — the system volume owns that direction", () => {
    expect(normalizeEnhancer({ boostDb: -6 }).boostDb).toBe(0);
  });

  it("falls back per field, so one bad value cannot discard the others", () => {
    expect(
      normalizeEnhancer({ boostDb: Number.NaN, bassDb: 6, trebleDb: undefined }),
    ).toEqual({ enabled: false, boostDb: 0, bassDb: 6, trebleDb: 0 });
  });
});

describe("patchEnhancer", () => {
  it("switches the curve on when a band moves", () => {
    const next = patchEnhancer(DEFAULT_ENHANCER, { bassDb: 4 });
    expect(next).toEqual({ enabled: true, boostDb: 0, bassDb: 4, trebleDb: 0 });
  });

  it("leaves the switch alone when only the switch was touched", () => {
    const on = { enabled: true, boostDb: 3, bassDb: 2, trebleDb: 0 };
    expect(patchEnhancer(on, { enabled: false })).toEqual({ ...on, enabled: false });
  });

  it("applies the patch on top of the existing curve", () => {
    const current = { enabled: true, boostDb: 3, bassDb: 2, trebleDb: -1 };
    expect(patchEnhancer(current, { trebleDb: 5 })).toEqual({
      enabled: true,
      boostDb: 3,
      bassDb: 2,
      trebleDb: 5,
    });
  });
});

describe("describeGainDb", () => {
  it("says Off rather than a signed zero", () => {
    expect(describeGainDb(0)).toBe("Off");
  });

  it("signs both directions, with a true minus", () => {
    expect(describeGainDb(3)).toBe("+3.0 dB");
    expect(describeGainDb(-4.5)).toBe("−4.5 dB");
  });
});

describe("isEnhancerFlat / isEnhancerActive", () => {
  it("treats a switched-on curve with no gain as inactive", () => {
    const on = { enabled: true, boostDb: 0, bassDb: 0, trebleDb: 0 };
    expect(isEnhancerFlat(on)).toBe(true);
    expect(isEnhancerActive(on)).toBe(false);
  });

  it("is active only when on and non-zero", () => {
    expect(isEnhancerActive({ enabled: true, boostDb: 0, bassDb: 1, trebleDb: 0 })).toBe(true);
    expect(isEnhancerActive({ enabled: false, boostDb: 0, bassDb: 1, trebleDb: 0 })).toBe(false);
  });
});

describe("parseEnhancer", () => {
  it("round-trips a stored curve", () => {
    const settings = { enabled: true, boostDb: 2, bassDb: -3.5, trebleDb: 6 };
    expect(parseEnhancer(serializeEnhancer(settings))).toEqual(settings);
  });

  it("returns the default for nothing stored", () => {
    expect(parseEnhancer(null)).toEqual(DEFAULT_ENHANCER);
    expect(parseEnhancer("")).toEqual(DEFAULT_ENHANCER);
  });

  it("returns the default rather than throwing on a broken row", () => {
    expect(parseEnhancer("{not json")).toEqual(DEFAULT_ENHANCER);
    expect(parseEnhancer("[1,2,3]")).toEqual(DEFAULT_ENHANCER);
    expect(parseEnhancer("42")).toEqual(DEFAULT_ENHANCER);
  });

  it("repairs a row that carries only some of the fields", () => {
    expect(parseEnhancer(JSON.stringify({ bassDb: 5 }))).toEqual({
      enabled: false,
      boostDb: 0,
      bassDb: 5,
      trebleDb: 0,
    });
  });
});

describe("roomToneAmplitude", () => {
  /** What the noise actually sits at in the mix, given the generated buffer. */
  function levelDb(percent: number): number {
    return TONE_TARGET_RMS_DB + 20 * Math.log10(roomToneAmplitude(percent));
  }

  it("is silent at zero, which is the only off", () => {
    expect(roomToneAmplitude(0)).toBe(0);
    expect(roomToneAmplitude(-10)).toBe(0);
  });

  it("rises with the level", () => {
    const levels = [10, 25, 50, 75, 100].map(roomToneAmplitude);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });

  it("stays below a level that would compete with speech, even at the top", () => {
    // −30 dBFS in the mix: a floor under a recording, never a layer over it.
    expect(levelDb(100)).toBeLessThan(-28);
    expect(levelDb(100)).toBeGreaterThan(-33);
  });

  it("makes the low end of the slider inaudible under a recording", () => {
    // The complaint this curve answers: at 1 % and 10 % the old mapping was
    // still audible under a quiet passage. Both are now below the noise floor
    // of the phone itself.
    expect(levelDb(1)).toBeLessThan(-70);
    expect(levelDb(10)).toBeLessThan(-70);
    expect(levelDb(50)).toBeLessThan(-50);
  });

  it("keeps even the first step above digital silence", () => {
    // The whole point: a sink that hears true silence powers down. Any non-zero
    // buffer is thousands of times above a zeroed one, however quiet it sounds.
    expect(roomToneAmplitude(1)).toBeGreaterThan(0.0005);
  });
});

describe("volumeAmplitude", () => {
  it("is exactly full scale at the top", () => {
    expect(volumeAmplitude(100)).toBeCloseTo(1, 6);
  });

  it("is silent at zero", () => {
    expect(volumeAmplitude(0)).toBe(0);
  });

  it("falls in decibels rather than in amplitude", () => {
    // Half the slider is −20 dB, not half the amplitude: a linear mapping spends
    // its top third doing almost nothing and its bottom third dropping off a
    // cliff.
    expect(20 * Math.log10(volumeAmplitude(50))).toBeCloseTo(-20, 6);
    expect(20 * Math.log10(volumeAmplitude(25))).toBeCloseTo(-30, 6);
  });

  it("clamps anything it is handed", () => {
    expect(volumeAmplitude(-5)).toBe(0);
    expect(volumeAmplitude(400)).toBeCloseTo(1, 6);
    expect(normalizeVolume(140)).toBe(100);
    expect(normalizeVolume("30")).toBe(30);
    expect(normalizeVolume("nonsense")).toBe(0);
  });
});

describe("describeLevel", () => {
  it("says Off at zero and a percentage otherwise", () => {
    expect(describeLevel(0)).toBe("Off");
    expect(describeLevel(42)).toBe("42%");
  });
});

describe("describeRoomTone / normalizeRoomTone", () => {
  it("says Off at zero and a percentage otherwise", () => {
    expect(describeRoomTone(0)).toBe("Off");
    expect(describeRoomTone(24)).toBe("24%");
  });

  it("rounds and clamps anything it is handed", () => {
    expect(normalizeRoomTone(24.6)).toBe(25);
    expect(normalizeRoomTone(-4)).toBe(0);
    expect(normalizeRoomTone(400)).toBe(100);
    expect(normalizeRoomTone("30")).toBe(30);
    expect(normalizeRoomTone("nonsense")).toBe(0);
    expect(normalizeRoomTone(null)).toBe(0);
  });
});
