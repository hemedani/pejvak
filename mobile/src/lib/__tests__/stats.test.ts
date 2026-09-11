import {
  computeDailyListen,
  computeDayStreak,
  computeListeningStats,
  computeTrackLeaders,
} from "@/lib/stats";
import type { HistoryItem } from "@/lib/history";
import type { LocalSession } from "@/lib/db/types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

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

function item(overrides: Partial<LocalSession> = {}, title = "Book"): HistoryItem {
  const s = session(overrides);
  return {
    session: s,
    track: { id: s.trackId, title, author: null, contentHash: s.contentHash },
  };
}

describe("computeListeningStats", () => {
  it("summarizes finalized sessions, excluding an open one from totals", () => {
    const stats = computeListeningStats([
      item({ id: "a", contentHash: "ha", endedAt: 100, durationListenedSec: 300 }, "A"),
      item({ id: "b", contentHash: "hb", endedAt: 200, durationListenedSec: 120 }, "B"),
      item(
        { id: "open", contentHash: "ha", startedAt: 5000, endedAt: null, durationListenedSec: 0 },
        "A",
      ),
    ]);

    expect(stats.sessionCount).toBe(2);
    expect(stats.totalListenTimeSec).toBe(420);
    expect(stats.trackCount).toBe(2);
    expect(stats.longestSessionSec).toBe(300);
    expect(stats.longestSessionTitle).toBe("A");
    expect(stats.lastPlayedAt).toBe(5000);
  });

  it("returns zeros when there is no history", () => {
    expect(computeListeningStats([])).toEqual({
      totalListenTimeSec: 0,
      sessionCount: 0,
      trackCount: 0,
      lastPlayedAt: null,
      longestSessionSec: 0,
      longestSessionTitle: null,
    });
  });
});

describe("computeTrackLeaders", () => {
  it("ranks tracks by listened time and aggregates play counts", () => {
    const leaders = computeTrackLeaders([
      item({ id: "a1", contentHash: "ha", durationListenedSec: 100 }, "A"),
      item({ id: "a2", contentHash: "ha", durationListenedSec: 100 }, "A"),
      item({ id: "b1", contentHash: "hb", durationListenedSec: 300 }, "B"),
    ]);

    expect(leaders.map((leader) => leader.title)).toEqual(["B", "A"]);
    expect(leaders[1]).toMatchObject({ contentHash: "ha", listenTimeSec: 200, playCount: 2 });
  });

  it("respects the limit", () => {
    const leaders = computeTrackLeaders(
      [
        item({ id: "a", contentHash: "ha", durationListenedSec: 100 }, "A"),
        item({ id: "b", contentHash: "hb", durationListenedSec: 200 }, "B"),
      ],
      1,
    );
    expect(leaders).toHaveLength(1);
    expect(leaders[0].title).toBe("B");
  });
});

describe("computeDailyListen", () => {
  it("buckets listened time by local day, ascending", () => {
    const buckets = computeDailyListen([
      item({ id: "a", startedAt: at(2026, 8, 10), durationListenedSec: 100 }),
      item({ id: "b", startedAt: at(2026, 8, 11), durationListenedSec: 50 }),
      item({ id: "c", startedAt: at(2026, 8, 11, 20), durationListenedSec: 25 }),
      item({ id: "d", startedAt: at(2026, 8, 11), endedAt: null, durationListenedSec: 0 }),
    ]);

    expect(buckets).toEqual([
      { key: "2026-09-10", listenTimeSec: 100 },
      { key: "2026-09-11", listenTimeSec: 75 },
    ]);
  });
});

describe("computeDayStreak", () => {
  it("counts consecutive days ending today", () => {
    const now = at(2026, 8, 11);
    const streak = computeDayStreak(
      [
        item({ id: "a", startedAt: at(2026, 8, 11) }),
        item({ id: "b", startedAt: at(2026, 8, 10) }),
        item({ id: "c", startedAt: at(2026, 8, 9) }),
        item({ id: "d", startedAt: at(2026, 8, 6) }),
      ],
      now,
    );
    expect(streak).toBe(3);
  });

  it("still counts a streak ending yesterday", () => {
    const now = at(2026, 8, 11);
    const streak = computeDayStreak(
      [
        item({ id: "a", startedAt: at(2026, 8, 10) }),
        item({ id: "b", startedAt: at(2026, 8, 9) }),
      ],
      now,
    );
    expect(streak).toBe(2);
  });

  it("is zero when neither today nor yesterday was used", () => {
    expect(
      computeDayStreak([item({ startedAt: at(2026, 8, 8) })], at(2026, 8, 11)),
    ).toBe(0);
  });
});
