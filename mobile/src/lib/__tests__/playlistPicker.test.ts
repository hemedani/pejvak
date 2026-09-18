import {
  actionFor,
  describeMembership,
  describeSelection,
  distinctTrackIds,
  membershipOf,
} from "@/lib/playlistPicker";
import type { PlaylistItem } from "@/lib/db/types";

const items = (...ids: string[]): PlaylistItem[] => ids.map((trackId, order) => ({ trackId, order }));

describe("distinctTrackIds", () => {
  it("collapses repeats but keeps first-seen order", () => {
    expect(distinctTrackIds(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });

  it("returns an empty list unchanged", () => {
    expect(distinctTrackIds([])).toEqual([]);
  });
});

describe("membershipOf", () => {
  it("reports 'none' when the playlist holds nothing selected", () => {
    expect(membershipOf(items("x", "y"), ["a", "b"])).toEqual({
      state: "none",
      count: 0,
      total: 2,
    });
  });

  it("reports 'all' when the playlist holds everything selected", () => {
    expect(membershipOf(items("a", "b"), ["a", "b"])).toEqual({
      state: "all",
      count: 2,
      total: 2,
    });
  });

  it("reports 'all' even when the playlist holds more than was selected", () => {
    expect(membershipOf(items("a", "b", "c", "d"), ["b", "c"])).toEqual({
      state: "all",
      count: 2,
      total: 2,
    });
  });

  it("reports 'some' for a partial overlap", () => {
    expect(membershipOf(items("a", "z"), ["a", "b", "c"])).toEqual({
      state: "some",
      count: 1,
      total: 3,
    });
  });

  it("treats an empty selection as 'none' rather than 'all'", () => {
    // "all of nothing" would be vacuously true and would offer to remove
    // tracks the user never selected.
    expect(membershipOf(items("a"), [])).toEqual({ state: "none", count: 0, total: 0 });
  });

  it("counts a repeated selection once", () => {
    expect(membershipOf(items("a"), ["a", "a"])).toEqual({ state: "all", count: 1, total: 1 });
  });

  it("does not care how many times the playlist lists a track", () => {
    expect(membershipOf(items("a", "a", "a"), ["a", "b"])).toEqual({
      state: "some",
      count: 1,
      total: 2,
    });
  });

  it("works on an empty playlist", () => {
    expect(membershipOf(items(), ["a"])).toEqual({ state: "none", count: 0, total: 1 });
  });
});

describe("actionFor", () => {
  it("only removes when the playlist already holds everything", () => {
    expect(actionFor("all")).toBe("remove");
  });

  it("adds for a partial row, so the row agrees with its own '2 of 3' label", () => {
    expect(actionFor("some")).toBe("add");
  });

  it("adds for an empty row", () => {
    expect(actionFor("none")).toBe("add");
  });
});

describe("describeMembership", () => {
  it("says how much of the selection is already there", () => {
    expect(describeMembership(membershipOf(items("a", "z"), ["a", "b", "c"]), 2)).toBe(
      "1 of 3 already here · 2 tracks",
    );
  });

  it("drops the trailing count when the playlist is exactly the selection", () => {
    expect(describeMembership(membershipOf(items("a", "b"), ["a", "b"]), 2)).toBe(
      "All 2 already here",
    );
  });

  it("keeps the trailing count when the playlist is larger", () => {
    expect(describeMembership(membershipOf(items("a", "b", "c", "d", "e"), ["a", "b"]), 5)).toBe(
      "All 2 already here · 5 tracks",
    );
  });

  it("just states the size for an unrelated playlist", () => {
    expect(describeMembership(membershipOf(items("x"), ["a"]), 7)).toBe("7 tracks");
  });

  it("singularises a one-track playlist", () => {
    expect(describeMembership(membershipOf(items(), ["a"]), 1)).toBe("1 track");
  });
});

describe("describeSelection", () => {
  it("counts distinct tracks", () => {
    expect(describeSelection(["a"])).toBe("1 track");
    expect(describeSelection(["a", "b", "c"])).toBe("3 tracks");
    expect(describeSelection(["a", "a", "b"])).toBe("2 tracks");
  });

  it("has something to say about nothing", () => {
    expect(describeSelection([])).toBe("Nothing selected");
  });
});
