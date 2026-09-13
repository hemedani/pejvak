import {
  dayKey,
  describeSpeed,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  groupSessionsByDay,
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

function item(startedAt: number, id = "s1"): HistoryItem {
  return {
    session: session({ id, startedAt }),
    track: { id: "t1", title: "Book", author: "Author", contentHash: "hash-1" },
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
