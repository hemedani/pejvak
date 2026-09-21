import {
  buildStretchSections,
  dayKey,
  describeSpeed,
  describeStretchTitle,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  groupByDay,
  groupHistoryIntoStretches,
  resumeTargetSec,
  stretchResumeTarget,
  type HistoryItem,
  type HistoryStretch,
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
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: overrides.stretchId ?? overrides.id ?? "s1",
    seeked: false,
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
    contextTitle: null,
  };
}

/** An item whose session fields are controlled directly. */
function itemWith(overrides: Partial<LocalSession>): HistoryItem {
  return {
    session: session(overrides),
    track: track(),
    contextTitle: null,
  };
}

/** A row for a named track, with the session and the projection agreeing. */
function rowOn(trackId: string, overrides: Partial<LocalSession> = {}): HistoryItem {
  return {
    session: session({ ...overrides, trackId }),
    track: track({ id: trackId, title: `Track ${trackId}` }),
    contextTitle: null,
  };
}

/** The one stretch those rows make up, so a case can name what it asserts on. */
function oneStretch(...rows: HistoryItem[]): HistoryStretch {
  const [entry] = groupHistoryIntoStretches(rows);
  if (!entry) {
    throw new Error(`no stretch was built from ${rows.length} rows`);
  }
  return entry;
}

describe("dayKey", () => {
  it("returns the local calendar date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 8, 11, 23, 30).getTime())).toBe("2026-09-11");
    expect(dayKey(new Date(2026, 8, 12, 0, 5).getTime())).toBe("2026-09-12");
  });
});

/** The timestamp rule every list on the History screen buckets by. */
const startedAt = (entry: HistoryItem): number => entry.session.startedAt;

describe("groupByDay", () => {
  it("groups by local day, newest day and newest row first", () => {
    const now = new Date(2026, 8, 11, 12, 0).getTime();
    const todayEarly = new Date(2026, 8, 11, 9, 0).getTime();
    const todayLate = new Date(2026, 8, 11, 11, 0).getTime();
    const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

    const groups = groupByDay(
      [item(todayEarly, "a"), item(yesterday, "b"), item(todayLate, "c")],
      startedAt,
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

    const [group] = groupByDay([item(older)], startedAt, now);

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

describe("groupByDay with order", () => {
  it("reverses both the days and the rows inside them", () => {
    const now = new Date(2026, 8, 11, 12, 0).getTime();
    const todayEarly = new Date(2026, 8, 11, 9, 0).getTime();
    const todayLate = new Date(2026, 8, 11, 11, 0).getTime();
    const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

    const groups = groupByDay(
      [item(todayEarly, "a"), item(yesterday, "b"), item(todayLate, "c")],
      startedAt,
      now,
      "oldest",
    );

    expect(groups.map((group) => group.key)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(groups[1].items.map((entry) => entry.session.id)).toEqual(["a", "c"]);
  });
});

describe("groupHistoryIntoStretches", () => {
  it("reads rows that share a stretch id as one listen", () => {
    const entries = groupHistoryIntoStretches([
      rowOn("t1", { id: "a", stretchId: "run-1", startedAt: 100 }),
      rowOn("t2", { id: "b", stretchId: "run-1", startedAt: 200 }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].stretch.trackCount).toBe(2);
    expect(entries[0].items.map((entry) => entry.session.id)).toEqual(["a", "b"]);
    expect(entries[0].start.session.id).toBe("a");
    expect(entries[0].end.session.id).toBe("b");
  });

  it("orders a listen by when its rows started, whatever order they arrived in", () => {
    // Rows come back from SQLite in query order, and after a pull they can come
    // from a device that never saw them; the ends must not depend on that.
    const entry = oneStretch(
      rowOn("t2", { id: "late", stretchId: "run-1", startedAt: 200 }),
      rowOn("t1", { id: "early", stretchId: "run-1", startedAt: 100 }),
    );

    expect(entry.start.session.id).toBe("early");
    expect(entry.end.session.id).toBe("late");
  });

  it("treats a row with no group of its own as a listen of one", () => {
    const entries = groupHistoryIntoStretches([item(100, "a"), item(200, "b")]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.stretch.trackCount)).toEqual([1, 1]);
  });

  it("returns the newest listen first", () => {
    const entries = groupHistoryIntoStretches([
      rowOn("t1", { id: "older", stretchId: "run-1", startedAt: 100 }),
      rowOn("t1", { id: "newer", stretchId: "run-2", startedAt: 900 }),
    ]);

    expect(entries.map((entry) => entry.stretch.id)).toEqual(["run-2", "run-1"]);
  });
});

describe("describeStretchTitle", () => {
  it("names both ends when the listen covered more than one track", () => {
    const entry = oneStretch(
      rowOn("t1", { id: "a", stretchId: "run-1", startedAt: 100 }),
      rowOn("t2", { id: "b", stretchId: "run-1", startedAt: 200 }),
    );

    expect(describeStretchTitle(entry)).toBe("Track t1 → Track t2");
  });

  it("names a single-track listen once, with no arrow", () => {
    const entry = oneStretch(rowOn("t1", { id: "a", startedAt: 100 }));

    expect(describeStretchTitle(entry)).toBe("Track t1");
  });
});

describe("buildStretchSections", () => {
  const now = new Date(2026, 8, 11, 12, 0).getTime();
  const today = new Date(2026, 8, 11, 9, 0).getTime();
  const yesterday = new Date(2026, 8, 10, 20, 0).getTime();

  it("keeps day headings for the chronological sorts", () => {
    const stretches = [
      oneStretch(itemWith({ id: "a", startedAt: today })),
      oneStretch(itemWith({ id: "b", startedAt: yesterday })),
    ];

    expect(buildStretchSections(stretches, "newest", now).map((s) => s.title)).toEqual([
      "Today",
      "Yesterday",
    ]);
    expect(buildStretchSections(stretches, "oldest", now).map((s) => s.title)).toEqual([
      "Yesterday",
      "Today",
    ]);
  });

  it("buckets a listen by the day it began, not the day it ended", () => {
    // An evening listen that ran past midnight belongs to the evening: that is
    // where the listener would go looking for it.
    const lateEvening = new Date(2026, 8, 10, 23, 40).getTime();
    const entry = oneStretch(
      itemWith({ id: "a", startedAt: lateEvening, endedAt: new Date(2026, 8, 11, 0, 30).getTime() }),
    );

    const [section] = buildStretchSections([entry], "newest", now);

    expect(section.key).toBe("2026-09-10");
  });

  it("returns one untitled section ranked by listened time for 'longest'", () => {
    const stretches = [
      oneStretch(itemWith({ id: "short", startedAt: today, durationListenedSec: 30 })),
      oneStretch(itemWith({ id: "long", startedAt: yesterday, durationListenedSec: 900 })),
      oneStretch(itemWith({ id: "mid", startedAt: today, durationListenedSec: 120 })),
    ];

    const sections = buildStretchSections(stretches, "longest", now);

    expect(sections).toHaveLength(1);
    // No heading: a day label would be meaningless in a ranking by length.
    expect(sections[0].title).toBeNull();
    expect(sections[0].data.map((entry) => entry.stretch.id)).toEqual(["long", "mid", "short"]);
  });

  it("breaks a listened-time tie with the most recent listen", () => {
    const stretches = [
      oneStretch(itemWith({ id: "older", startedAt: yesterday, durationListenedSec: 60 })),
      oneStretch(itemWith({ id: "newer", startedAt: today, durationListenedSec: 60 })),
    ];

    const [section] = buildStretchSections(stretches, "longest", now);

    expect(section.data.map((entry) => entry.stretch.id)).toEqual(["newer", "older"]);
  });

  it("does not reorder the array it was given", () => {
    const stretches = [
      oneStretch(itemWith({ id: "a", durationListenedSec: 10 })),
      oneStretch(itemWith({ id: "b", durationListenedSec: 99 })),
    ];

    buildStretchSections(stretches, "longest", now);

    expect(stretches.map((entry) => entry.stretch.id)).toEqual(["a", "b"]);
  });
});

describe("stretchResumeTarget", () => {
  it("replays a listen heard through from its first track", () => {
    const entry = oneStretch(
      rowOn("t1", { id: "a", stretchId: "run-1", startedAt: 100, startPositionSec: 0 }),
      rowOn("t2", { id: "b", stretchId: "run-1", startedAt: 200, startPositionSec: 0 }),
    );

    const target = stretchResumeTarget(entry);

    expect(target.item.session.id).toBe("a");
    expect(target.item.track.id).toBe("t1");
    expect(target.positionSec).toBe(0);
  });

  it("continues an unfinished listen on the track it stopped on", () => {
    const entry = oneStretch(
      rowOn("t1", {
        id: "a",
        stretchId: "run-1",
        startedAt: 100,
        completed: false,
        endPositionSec: 300,
      }),
      rowOn("t2", {
        id: "b",
        stretchId: "run-1",
        startedAt: 400,
        completed: false,
        startPositionSec: 0,
        endPositionSec: 430,
      }),
    );

    const target = stretchResumeTarget(entry);

    expect(target.item.session.id).toBe("b");
    expect(target.item.track.id).toBe("t2");
    expect(target.positionSec).toBe(430);
  });

  it("never pairs the first track with the last track's position", () => {
    // The whole reason the target is a pair: the start track's offset and the
    // end track's offset are seconds in *different files*, so a caller that took
    // the track from one end and the number from the other would drop the
    // listener 430 seconds into a track they had not reached.
    const entry = oneStretch(
      rowOn("t1", {
        id: "a",
        stretchId: "run-1",
        startedAt: 100,
        completed: false,
        startPositionSec: 12,
        endPositionSec: 300,
      }),
      rowOn("t2", {
        id: "b",
        stretchId: "run-1",
        startedAt: 400,
        completed: false,
        startPositionSec: 0,
        endPositionSec: 430,
      }),
    );

    const target = stretchResumeTarget(entry);

    expect(target.positionSec).not.toBe(entry.stretch.startPositionSec);
    expect(target.positionSec).toBe(entry.stretch.endPositionSec);
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
