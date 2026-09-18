import {
  buildHistorySections,
  dayKey,
  describeSpeed,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  groupSessionsByDay,
  resumeTargetSec,
  type HistoryItem,
} from "@/lib/history";
import type { LocalSession } from "@/lib/db/types";

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "s1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    startedAt: 0,
    endedAt: 60,
    startPositionSec: 0,
    endPositionSec: 60,
    durationListenedSec: 60,
    playbackSpeed: 1,
    completed: true,
    interrupted: false,
    deviceInfo: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function track(overrides: Partial<HistoryItem["track"]> = {}): HistoryItem["track"] {
  return {
    id: "t1",
    title: "Book",
    author: "Author",
    contentHash: "hash-1",
    isAudiobook: true,
    ...overrides,
    // After the spread, and coalesced: `Partial` makes the field optional, so
    // leaving it to the spread would widen it to `undefined` and no longer
    // satisfy the projection the type declares.
    artworkUrl: overrides.artworkUrl ?? null,
  };
}

function item(startedAt: number, id = "s1"): HistoryItem {
  return {
    session: session({ id, startedAt }),
    track: track(),
  };
}

/** An item whose session fields are controlled directly. */
function itemWith(overrides: Partial<LocalSession>): HistoryItem {
  return {
    session: session(overrides),
    track: track(),
  };
}

describe("dayKey", () => {
  it("returns the local calendar date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 8, 11, 23, 30).getTime())).toBe("2026-09-11");
    expect(dayKey(new Date(2026, 8, 12, 0, 5).getTime())).toBe("2026-09-12");
  });
});

describe("groupSessionsByDay", () => {
  it("groups by local day, newest day and newest session first", () => {
    const now = new Date(2026, 8, 11, 12, 0).getTime();
    const todayEarly = new Date(2026, 8, 11, 9, 0).getTime();
    const todayLate = new Date(2026, 8, 11, 11, 0).getTime();
    const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

    const groups = groupSessionsByDay(
      [item(todayEarly, "a"), item(yesterday, "b"), item(todayLate, "c")],
      now,
    );

    expect(groups.map((group) => group.key)).toEqual(["2026-09-11", "2026-09-10"]);
    expect(groups[0].label).toBe("Today");
    expect(groups[1].label).toBe("Yesterday");
    expect(groups[0].items.map((entry) => entry.session.id)).toEqual(["c", "a"]);
  });

  it("labels older days with the weekday and date", () => {
    const now = new Date(2026, 8, 11, 12, 0).getTime();
    const older = new Date(2026, 8, 8, 8, 0).getTime();

    const [group] = groupSessionsByDay([item(older)], now);

    expect(group.label).toBe("Tue, Sep 8");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes, and hours compactly", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3665)).toBe("1h 1m");
    expect(formatDuration(7320)).toBe("2h 2m");
  });
});

describe("formatTimeRange", () => {
  it("formats a completed range with 24h times", () => {
    const start = new Date(2026, 8, 11, 9, 15).getTime();
    const end = new Date(2026, 8, 11, 9, 22).getTime();
    expect(formatTimeRange(start, end)).toBe("09:15 – 09:22");
  });

  it("marks an unfinished session", () => {
    const start = new Date(2026, 8, 11, 9, 15).getTime();
    expect(formatTimeRange(start, null)).toBe("09:15 – in progress");
  });
});

describe("describeSpeed", () => {
  it("renders playback speed with a multiplication sign", () => {
    expect(describeSpeed(1)).toBe("1×");
    expect(describeSpeed(1.25)).toBe("1.25×");
    expect(describeSpeed(2)).toBe("2×");
  });
});

describe("formatPositionRange", () => {
  it("formats the position range within the track", () => {
    expect(formatPositionRange(0, 60)).toBe("0:00 – 1:00");
    expect(formatPositionRange(3661, 3720)).toBe("1:01:01 – 1:02:00");
  });

  it("marks an unfinished session", () => {
    expect(formatPositionRange(120, null)).toBe("2:00 – in progress");
  });
});

describe("groupSessionsByDay with order", () => {
  it("reverses both the days and the sessions inside them", () => {
    const now = new Date(2026, 8, 11, 12, 0).getTime();
    const todayEarly = new Date(2026, 8, 11, 9, 0).getTime();
    const todayLate = new Date(2026, 8, 11, 11, 0).getTime();
    const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

    const groups = groupSessionsByDay(
      [item(todayEarly, "a"), item(yesterday, "b"), item(todayLate, "c")],
      now,
      "oldest",
    );

    expect(groups.map((group) => group.key)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(groups[1].items.map((entry) => entry.session.id)).toEqual(["a", "c"]);
  });
});

describe("buildHistorySections", () => {
  const now = new Date(2026, 8, 11, 12, 0).getTime();
  const today = new Date(2026, 8, 11, 9, 0).getTime();
  const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

  it("keeps day headings for the chronological sorts", () => {
    const items = [item(today, "a"), item(yesterday, "b")];

    expect(buildHistorySections(items, "newest", now).map((s) => s.title)).toEqual([
      "Today",
      "Yesterday",
    ]);
    expect(buildHistorySections(items, "oldest", now).map((s) => s.title)).toEqual([
      "Yesterday",
      "Today",
    ]);
  });

  it("returns one untitled section ranked by listened time for 'longest'", () => {
    const items = [
      itemWith({ id: "short", startedAt: today, durationListenedSec: 30 }),
      itemWith({ id: "long", startedAt: yesterday, durationListenedSec: 900 }),
      itemWith({ id: "mid", startedAt: today, durationListenedSec: 120 }),
    ];

    const sections = buildHistorySections(items, "longest", now);

    expect(sections).toHaveLength(1);
    // No heading: a day label would be meaningless in a ranking by length.
    expect(sections[0].title).toBeNull();
    expect(sections[0].data.map((entry) => entry.session.id)).toEqual(["long", "mid", "short"]);
  });

  it("breaks a listened-time tie with the most recent session", () => {
    const items = [
      itemWith({ id: "older", startedAt: yesterday, durationListenedSec: 60 }),
      itemWith({ id: "newer", startedAt: today, durationListenedSec: 60 }),
    ];

    const [section] = buildHistorySections(items, "longest", now);

    expect(section.data.map((entry) => entry.session.id)).toEqual(["newer", "older"]);
  });

  it("does not reorder the array it was given", () => {
    const items = [
      itemWith({ id: "a", durationListenedSec: 10 }),
      itemWith({ id: "b", durationListenedSec: 99 }),
    ];

    buildHistorySections(items, "longest", now);

    expect(items.map((entry) => entry.session.id)).toEqual(["a", "b"]);
  });
});

describe("resumeTargetSec", () => {
  it("continues from where an unfinished session stopped", () => {
    expect(
      resumeTargetSec(itemWith({ completed: false, startPositionSec: 100, endPositionSec: 430 })),
    ).toBe(430);
  });

  it("replays from the start of a finished session", () => {
    // Seeking to a completed session's end would finish the track the instant
    // it started, so a finished entry replays from where that session began.
    expect(
      resumeTargetSec(itemWith({ completed: true, startPositionSec: 100, endPositionSec: 430 })),
    ).toBe(100);
  });

  it("falls back to the start position while a session is in progress", () => {
    expect(
      resumeTargetSec(
        itemWith({ completed: false, endedAt: null, startPositionSec: 75, endPositionSec: null }),
      ),
    ).toBe(75);
  });
});
