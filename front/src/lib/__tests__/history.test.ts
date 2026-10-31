/**
 * The listening stretch, its day sections, and the range.
 *
 * What is worth locking here is not arithmetic — it is the two rules this screen
 * can break silently:
 *
 *   · **A verdict is reported, never recomputed.** `completed`, `interrupted`
 *     and `seeked` are the phone's. A stretch that ran to the end of its last
 *     track but started at 0:30 has *not* been heard, and must never be labelled
 *     «کامل» — that is a stronger claim than the stored row supports.
 *   · **A day is a number, not a string.** Bucketing on a formatted heading
 *     merges two different days whenever the calendar and the zone disagree, and
 *     the list silently loses one.
 *
 * The fixtures are local-time `Date`s on purpose: `startOfDay`, «امروز» and the
 * Jalali heading all read the machine's zone, so a test written in UTC offsets
 * would pass in one zone and fail in another.
 */

import { describe, expect, it } from "vitest";

import {
  HISTORY_SESSION_GET,
  parseHistoryList,
  parseHistorySession,
  type HistorySession,
  type HistoryTrack,
} from "../domain/history";
import {
  buildHistoryHref,
  buildHistorySections,
  buildStretch,
  describeHistorySummary,
  describeStretchOutcome,
  describeStretchTitle,
  describeStretchTracks,
  describeStretchVerdict,
  formatStretchPositionRange,
  formatStretchTimeRange,
  groupSessionsIntoStretches,
  isoDay,
  parseHistoryRange,
  stretchResumeTarget,
  stretchTitleParts,
} from "../history";
import { formatDayHeading, formatYear, startOfDay } from "../time";

const HOUR = 3_600_000;

function track(overrides: Partial<HistoryTrack> = {}): HistoryTrack {
  return {
    id: "t1",
    contentHash: "hash-1",
    title: "فصل یک",
    durationSec: 600,
    author: null,
    narrator: null,
    artworkUrl: null,
    origin: "online",
    sourceId: "manahej",
    externalId: "7101",
    collectionKey: "manahej:190",
    collectionTitle: "تاریخ شیعه",
    ...overrides,
  };
}

function session(overrides: Partial<HistorySession> = {}): HistorySession {
  return {
    id: "s1",
    contentHash: "hash-1",
    track: track(),
    startedAt: 0,
    endedAt: 600_000,
    startPositionSec: 0,
    endPositionSec: 600,
    durationListenedSec: 600,
    playbackSpeed: 1,
    completed: true,
    interrupted: false,
    seeked: false,
    stretchId: "st1",
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    ...overrides,
  };
}

/** One stretch of one session that began at `startedAt`. */
function stretchAt(startedAt: number, id: string) {
  return buildStretch([session({ id, stretchId: id, startedAt, endedAt: startedAt + HOUR })])!;
}

describe("buildStretch", () => {
  it("picks the first and last track by time, not by arrival", () => {
    const stretch = buildStretch([
      session({ id: "s2", startedAt: 2 * HOUR, track: track({ id: "t2", title: "دوم" }) }),
      session({ id: "s1", startedAt: 0, track: track({ id: "t1", title: "اول" }) }),
      session({ id: "s3", startedAt: 4 * HOUR, track: track({ id: "t3", title: "سوم" }) }),
    ])!;

    expect(stretch.members.map((member) => member.id)).toEqual(["s1", "s2", "s3"]);
    expect(stretch.startTrackId).toBe("t1");
    expect(stretch.endTrackId).toBe("t3");
    expect(stretch.startedAt).toBe(0);
    expect(stretch.endedAt).toBe(600_000);
  });

  it("sums listened time instead of measuring the distance between positions", () => {
    // A seek leaves a wide gap between the two positions and only a minute of
    // actual listening: `end - start` would report the gap.
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, startPositionSec: 0, endPositionSec: 120, durationListenedSec: 60 }),
      session({ id: "s2", startedAt: HOUR, startPositionSec: 900, endPositionSec: 1200, durationListenedSec: 60 }),
    ])!;

    expect(stretch.listenedSec).toBe(120);
  });

  it("reports a scrub if any member was scrubbed", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0 }),
      session({ id: "s2", startedAt: HOUR, seeked: true }),
    ])!;

    expect(stretch.seeked).toBe(true);
  });

  it("takes completion from the last member and interruption from any", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, completed: true, interrupted: true }),
      session({ id: "s2", startedAt: HOUR, completed: false, interrupted: false }),
    ])!;

    expect(stretch.completed).toBe(false);
    expect(stretch.interrupted).toBe(true);
  });

  it("is complete only when it started at zero, ended, finished, and never seeked", () => {
    const complete = buildStretch([session({ startedAt: 0 })])!;
    expect(complete.isComplete).toBe(true);
    expect(describeStretchOutcome(complete)).toBe("complete");

    // Began 30s in: the last track ran out, but the listen did not.
    const startedLate = buildStretch([session({ startedAt: 0, startPositionSec: 30 })])!;
    expect(startedLate.isComplete).toBe(false);
    expect(describeStretchOutcome(startedLate)).toBe("finished");

    const scrubbed = buildStretch([session({ startedAt: 0, seeked: true })])!;
    expect(scrubbed.isComplete).toBe(false);
    expect(describeStretchOutcome(scrubbed)).toBe("finished");

    const unfinished = buildStretch([session({ startedAt: 0, completed: false })])!;
    expect(unfinished.isComplete).toBe(false);
    expect(describeStretchOutcome(unfinished)).toBe("interrupted");

    const open = buildStretch([session({ startedAt: 0, endedAt: null })])!;
    expect(open.isComplete).toBe(false);
    expect(describeStretchOutcome(open)).toBe("open");
  });

  it("returns null for an empty group rather than inventing a stretch", () => {
    expect(buildStretch([])).toBeNull();
  });
});

describe("groupSessionsIntoStretches", () => {
  it("groups by stretch id, newest first", () => {
    const stretches = groupSessionsIntoStretches([
      session({ id: "a", stretchId: "st-old", startedAt: 0 }),
      session({ id: "b", stretchId: "st-new", startedAt: 3 * HOUR }),
      session({ id: "c", stretchId: "st-new", startedAt: 2 * HOUR }),
    ]);

    expect(stretches.map((stretch) => stretch.id)).toEqual(["st-new", "st-old"]);
    expect(stretches[0]!.members.map((member) => member.id)).toEqual(["c", "b"]);
  });

  it("treats a row with no stretch id as a stretch of one", () => {
    // What the v10 backfill made of every row written before stretches existed.
    const parsed = parseHistorySession({ _id: "row-1", startedAt: 1_000 })!;
    expect(parsed.stretchId).toBe("row-1");

    const stretches = groupSessionsIntoStretches([parsed]);
    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.id).toBe("row-1");
  });
});

describe("stretchResumeTarget", () => {
  it("replays a completed stretch from the track and second it began on", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, startPositionSec: 0, track: track({ id: "t1" }) }),
      session({ id: "s2", startedAt: HOUR, startPositionSec: 0, track: track({ id: "t2" }) }),
    ])!;

    expect(stretchResumeTarget(stretch)).toEqual({
      trackId: "t1",
      contentHash: "hash-1",
      positionSec: 0,
    });
  });

  it("continues an unfinished stretch from the track and second it stopped on", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, startPositionSec: 0, track: track({ id: "t1" }) }),
      session({
        id: "s2",
        startedAt: HOUR,
        startPositionSec: 120,
        endPositionSec: 420,
        completed: false,
        track: track({ id: "t2" }),
      }),
    ])!;

    expect(stretchResumeTarget(stretch)).toEqual({
      trackId: "t2",
      contentHash: "hash-1",
      positionSec: 420,
    });
  });

  it("falls back to the start position while the last session is still open", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, startPositionSec: 90, endedAt: null, completed: false }),
    ])!;

    expect(stretchResumeTarget(stretch).positionSec).toBe(90);
  });
});

describe("titles", () => {
  it("names a single-track listen once", () => {
    const stretch = buildStretch([session({ startedAt: 0 })])!;
    const parts = stretchTitleParts(stretch);

    expect(parts.end).toBeNull();
    expect(describeStretchTitle(stretch)).toBe("فصل یک");
    expect(describeStretchTracks(stretch)).toBeNull();
  });

  it("joins two tracks with an arrow and counts them", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, track: track({ id: "t1", title: "اول" }) }),
      session({ id: "s2", startedAt: HOUR, track: track({ id: "t2", title: "آخر" }) }),
    ])!;

    expect(describeStretchTitle(stretch)).toBe("اول → آخر");
    expect(describeStretchTracks(stretch)).toBe("۲ قطعه");
  });

  it("falls back to a removed-track label with no id to link", () => {
    const stretch = buildStretch([
      session({ id: "s1", startedAt: 0, track: null }),
      session({ id: "s2", startedAt: HOUR, track: null }),
    ])!;

    const parts = stretchTitleParts(stretch);
    expect(parts.start).toEqual({ title: "ترک حذف‌شده", trackId: null });
    expect(parts.end).toEqual({ title: "ترک حذف‌شده", trackId: null });
  });
});

describe("verdicts", () => {
  it("never calls a finished-but-not-complete listen «کامل»", () => {
    const finished = buildStretch([session({ startPositionSec: 30 })])!;
    expect(describeStretchVerdict(finished)).toEqual({
      label: "تا پایان ترک",
      tone: "neutral",
    });

    const complete = buildStretch([session()])!;
    expect(describeStretchVerdict(complete)).toEqual({ label: "کامل", tone: "accent" });
  });

  it("has no badge while the listen is still open", () => {
    const open = buildStretch([session({ endedAt: null })])!;
    expect(describeStretchVerdict(open)).toBeNull();
  });
});

describe("meta lines", () => {
  it("hides a position range that never moved", () => {
    const stuck = buildStretch([session({ startPositionSec: 0, endPositionSec: 0 })])!;
    expect(formatStretchPositionRange(stuck)).toBeNull();

    const moved = buildStretch([session({ startPositionSec: 0, endPositionSec: 240 })])!;
    expect(formatStretchPositionRange(moved)).toBe("۰:۰۰ – ۴:۰۰");
  });

  it("says a stretch is still running when it has no end", () => {
    const open = buildStretch([session({ endedAt: null })])!;
    expect(formatStretchTimeRange(open)).toContain("در جریان");
  });
});

describe("buildHistorySections", () => {
  // Local noon on 31 Oct 2026, so "today" and "yesterday" are unambiguous.
  const now = new Date(2026, 9, 31, 12, 0, 0).getTime();
  const today = new Date(2026, 9, 31, 9, 0, 0).getTime();
  const yesterday = new Date(2026, 9, 30, 9, 0, 0).getTime();
  const lastYear = new Date(2023, 4, 10, 9, 0, 0).getTime();

  it("labels today and yesterday in words, and an older day by its date", () => {
    const sections = buildHistorySections(
      [stretchAt(today, "a"), stretchAt(yesterday, "b"), stretchAt(lastYear, "c")],
      now,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "امروز",
      "دیروز",
      `${formatDayHeading(lastYear)} ${formatYear(lastYear)}`,
    ]);
  });

  it("keeps a listen that ran past midnight on the evening it began", () => {
    const lateEvening = new Date(2026, 9, 30, 23, 30, 0).getTime();
    const stretch = buildStretch([
      session({
        startedAt: lateEvening,
        endedAt: new Date(2026, 9, 31, 0, 20, 0).getTime(),
      }),
    ])!;

    const [section] = buildHistorySections([stretch], now);
    expect(section!.key).toBe(String(startOfDay(lateEvening)));
    expect(section!.title).toBe("دیروز");
  });

  it("orders days newest first and sums each day's listening", () => {
    const sections = buildHistorySections(
      [
        stretchAt(today, "a"),
        stretchAt(today + HOUR, "b"),
        stretchAt(yesterday, "c"),
      ],
      now,
    );

    expect(sections.map((section) => section.key)).toEqual([
      String(startOfDay(today)),
      String(startOfDay(yesterday)),
    ]);
    // Each fixture stretch holds one 600-second session.
    expect(sections[0]!.listenedSec).toBe(1200);
    expect(sections[1]!.listenedSec).toBe(600);
  });

  it("says how many listens this page holds, never a lifetime figure", () => {
    expect(describeHistorySummary([stretchAt(today, "a"), stretchAt(today, "b")])).toBe(
      "۲ شنیدن در این صفحه · ۲۰ دقیقه",
    );
  });
});

describe("parseHistorySession", () => {
  it("drops a row it cannot place in time", () => {
    expect(parseHistorySession({ startedAt: 1_000 })).toBeNull();
    expect(parseHistorySession({ _id: "row-1" })).toBeNull();
    expect(parseHistorySession("nonsense")).toBeNull();
  });

  it("keeps a row whose track relation was lost", () => {
    const parsed = parseHistorySession({ _id: "row-1", startedAt: 1_000, contentHash: "h" })!;

    expect(parsed).not.toBeNull();
    expect(parsed.track).toBeNull();
    expect(parsed.contentHash).toBe("h");
  });

  it("defaults a missing speed to 1× and clamps a negative duration", () => {
    const parsed = parseHistorySession({
      _id: "row-1",
      startedAt: 1_000,
      durationListenedSec: -30,
      startPositionSec: -5,
    })!;

    expect(parsed.playbackSpeed).toBe(1);
    expect(parsed.durationListenedSec).toBe(0);
    expect(parsed.startPositionSec).toBe(0);
  });

  it("falls back to the relation's content hash and to its own id for the stretch", () => {
    const parsed = parseHistorySession({
      _id: "row-1",
      startedAt: 1_000,
      track: { _id: "t1", contentHash: "from-track", title: "فصل یک" },
    })!;

    expect(parsed.contentHash).toBe("from-track");
    expect(parsed.stretchId).toBe("row-1");
    expect(parsed.track!.title).toBe("فصل یک");
  });

  it("preserves the act's order", () => {
    const rows = parseHistoryList([
      { _id: "new", startedAt: 2_000 },
      { _id: "old", startedAt: 1_000 },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("asks for the track fields a row prints", () => {
    // A projection typo is a compile error, but this is the net under the
    // declarations: if `track` is ever dropped from the projection the row
    // silently becomes «ترک حذف‌شده» for every session.
    expect(HISTORY_SESSION_GET.track).toMatchObject({
      _id: 1,
      contentHash: 1,
      title: 1,
      origin: 1,
      sourceId: 1,
      collectionTitle: 1,
    });
  });
});

describe("parseHistoryRange", () => {
  it("returns no bounds when the URL carries no dates", () => {
    expect(parseHistoryRange(undefined, undefined)).toEqual({
      from: undefined,
      to: undefined,
      invalid: false,
    });
    expect(parseHistoryRange("", "")).toEqual({
      from: undefined,
      to: undefined,
      invalid: false,
    });
  });

  it("covers the whole end day, because the act's `to` is inclusive", () => {
    const range = parseHistoryRange("2026-09-01", "2026-09-30");
    const endOfDay = new Date(2026, 8, 30, 23, 59, 59, 999).getTime();

    expect(range.from).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
    expect(range.to).toBe(endOfDay);
    expect(range.invalid).toBe(false);
  });

  it("ignores a reversed range instead of throwing", () => {
    expect(parseHistoryRange("2026-09-30", "2026-09-01")).toEqual({
      from: undefined,
      to: undefined,
      invalid: true,
    });
  });

  it("round-trips a day through the URL", () => {
    const range = parseHistoryRange("2026-09-30", "2026-09-30");
    expect(isoDay(range.from!)).toBe("2026-09-30");
    expect(isoDay(range.to!)).toBe("2026-09-30");
  });
});

describe("buildHistoryHref", () => {
  it("omits the first page, so one screen has one URL", () => {
    expect(buildHistoryHref({})).toBe("/history");
    expect(buildHistoryHref({ after: 0 })).toBe("/history");
    expect(buildHistoryHref({ after: 100 })).toBe("/history?after=100");
  });

  it("carries the active range with the cursor", () => {
    const range = parseHistoryRange("2026-09-01", "2026-09-30");
    expect(buildHistoryHref({ after: 100, from: range.from, to: range.to })).toBe(
      "/history?from=2026-09-01&to=2026-09-30&after=100",
    );
  });

  it("drops the cursor when the range changes", () => {
    // The caller drops it by not passing it; a page four of another range does
    // not exist.
    const range = parseHistoryRange("2026-09-01", undefined);
    expect(buildHistoryHref({ from: range.from })).toBe("/history?from=2026-09-01");
  });
});
