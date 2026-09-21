import { buildRunSections } from "@/lib/contextHistory";
import type { LocalContextPlay } from "@/lib/db/types";

/** A fixed "now" so the day labels are deterministic: Mon 21 Sep 2026, local. */
const NOW = new Date(2026, 8, 21, 12, 0, 0).getTime();
const HOUR = 3_600_000;

function run(overrides: Partial<LocalContextPlay> = {}): LocalContextPlay {
  return {
    id: "run-1",
    serverId: null,
    contextType: "folder",
    contextKey: "Lectures",
    contextTitle: "Lectures",
    trackCount: 24,
    startedAt: NOW - 2 * HOUR,
    endedAt: NOW - 1 * HOUR,
    lastIndex: 8,
    lastTrackId: "t9",
    lastPositionSec: 120,
    listenedSec: 3600,
    finishedCount: 9,
    completed: false,
    interrupted: true,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: NOW - 2 * HOUR,
    updatedAt: NOW - 1 * HOUR,
    ...overrides,
  };
}

describe("buildRunSections", () => {
  it("is empty for no runs", () => {
    expect(buildRunSections([], "newest", NOW)).toEqual([]);
  });

  it("buckets runs by the day they started, newest day first", () => {
    const today = run({ id: "today" });
    const yesterday = run({ id: "yesterday", startedAt: NOW - 26 * HOUR });

    const sections = buildRunSections([yesterday, today], "newest", NOW);

    expect(sections.map((section) => section.title)).toEqual(["Today", "Yesterday"]);
    expect(sections[0]?.data.map((item) => item.id)).toEqual(["today"]);
    expect(sections[1]?.data.map((item) => item.id)).toEqual(["yesterday"]);
  });

  it("orders runs inside a day, newest first", () => {
    const older = run({ id: "older", startedAt: NOW - 5 * HOUR });
    const newer = run({ id: "newer", startedAt: NOW - 1 * HOUR });

    const [section] = buildRunSections([older, newer], "newest", NOW);

    expect(section?.data.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("flips both the days and the runs inside them for 'oldest'", () => {
    const today = run({ id: "today", startedAt: NOW - 1 * HOUR });
    const yesterday = run({ id: "yesterday", startedAt: NOW - 26 * HOUR });

    const sections = buildRunSections([today, yesterday], "oldest", NOW);

    expect(sections.map((section) => section.title)).toEqual(["Yesterday", "Today"]);
  });

  it("dates a day by the local calendar, not by 24-hour blocks", () => {
    // 23:30 and 00:30 on either side of midnight are different days however
    // close together they are.
    const late = run({ id: "late", startedAt: new Date(2026, 8, 20, 23, 30).getTime() });
    const early = run({ id: "early", startedAt: new Date(2026, 8, 21, 0, 30).getTime() });

    const sections = buildRunSections([late, early], "newest", NOW);

    expect(sections).toHaveLength(2);
  });

  it("drops the day headings for 'longest', which has nothing to do with days", () => {
    const short = run({ id: "short", listenedSec: 60 });
    const long = run({ id: "long", listenedSec: 7200, startedAt: NOW - 30 * HOUR });

    const sections = buildRunSections([short, long], "longest", NOW);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeNull();
    expect(sections[0]?.data.map((item) => item.id)).toEqual(["long", "short"]);
  });

  it("breaks a listened-time tie with the more recent run", () => {
    const older = run({ id: "older", listenedSec: 600, startedAt: NOW - 5 * HOUR });
    const newer = run({ id: "newer", listenedSec: 600, startedAt: NOW - 1 * HOUR });

    const [section] = buildRunSections([older, newer], "longest", NOW);

    expect(section?.data.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the runs it was given", () => {
    const runs = [run({ id: "a" }), run({ id: "b", listenedSec: 10 })];
    buildRunSections(runs, "longest", NOW);
    expect(runs.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
