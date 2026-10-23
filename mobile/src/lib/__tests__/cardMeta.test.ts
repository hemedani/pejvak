import { joinMeta, plural } from "@/lib/cardMeta";

describe("joinMeta", () => {
  it("returns null when there is nothing to say", () => {
    expect(joinMeta([])).toBeNull();
    expect(joinMeta([null, undefined, "   "])).toBeNull();
  });

  it("joins the parts that exist", () => {
    expect(joinMeta(["12 tracks", "1 note"])).toBe("12 tracks · 1 note");
  });

  it("drops empty parts without leaving a separator", () => {
    expect(joinMeta(["", "Playing", null, "2 notes"])).toBe("Playing · 2 notes");
    expect(joinMeta([null, "Playing", ""])).toBe("Playing");
  });

  it("trims a part before deciding whether it exists", () => {
    expect(joinMeta(["  Playing  ", "   "])).toBe("Playing");
  });

  it("never doubles a separator when a part already carries one", () => {
    expect(joinMeta(["Playing ·", "2 notes"])).toBe("Playing · 2 notes");
    expect(joinMeta(["Playing · ", "", "2 notes"])).toBe("Playing · 2 notes");
  });
});

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "track")).toBe("1 track");
    expect(plural(-1, "track")).toBe("-1 tracks");
  });

  it("uses the regular plural everywhere else", () => {
    expect(plural(0, "track")).toBe("0 tracks");
    expect(plural(2, "track")).toBe("2 tracks");
  });

  it("accepts an irregular plural", () => {
    expect(plural(0, "entry", "entries")).toBe("0 entries");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
    expect(plural(1, "entry", "entries")).toBe("1 entry");
  });
});
