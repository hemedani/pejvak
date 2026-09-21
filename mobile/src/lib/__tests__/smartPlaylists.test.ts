import type { LocalSession, LocalTrack } from "@/lib/db/types";
import {
  COMMUTE_BUDGETS_SEC,
  DEFAULT_COMMUTE_BUDGET_SEC,
  SMART_RULES,
  buildSmartPlaylist,
  buildSmartPlaylists,
  buildTrackHistoryIndex,
  daysSince,
  describeRecency,
  fillToBudget,
  forgottenScore,
  isSmartRuleId,
  reviewScore,
  ruleFor,
  type SmartContext,
  type SmartRuleId,
} from "@/lib/smartPlaylists";

const DAY_MS = 86_400_000;
/** Local-time construction, so `dayKey` agrees with the assertions. */
const NOW = new Date("2026-09-17T09:00:00").getTime();
const daysAgo = (days: number) => NOW - days * DAY_MS;

function track(id: string, overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: id,
    fileName: `${id}.mp3`,
    fileUri: `file:///audio/${id}.mp3`,
    durationSec: 600,
    fileSizeBytes: 1_000_000,
    mimeType: "audio/mpeg",
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    source: "mediastore",
    sourceUri: `content://media/${id}`,
    sourcePath: `/storage/emulated/0/Audio/${id}.mp3`,
    sourceSize: 1_000_000,
    sourceMtime: 0,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    ...overrides,
  };
}

let sessionCounter = 0;

/**
 * The default `endedAt` is derived from the (possibly overridden) `startedAt`,
 * not from a fixed base. A fixed one would make every session in a fixture end
 * at the same instant, silently tying `lastPlayedAt` across tracks and hiding
 * the very ordering the tests are about.
 */
function session(
  trackId: string,
  overrides: Partial<LocalSession> = {},
): LocalSession {
  sessionCounter += 1;
  const startedAt = overrides.startedAt ?? daysAgo(1);
  return {
    id: `session-${sessionCounter}`,
    serverId: null,
    trackId,
    contentHash: `hash-${trackId}`,
    startedAt,
    endedAt: startedAt + 300_000,
    startPositionSec: 0,
    endPositionSec: 120,
    durationListenedSec: 120,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: `session-${sessionCounter}`,
    seeked: false,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function context(overrides: Partial<SmartContext> = {}): SmartContext {
  return {
    tracks: [],
    sessions: [],
    annotationCounts: {},
    now: NOW,
    ...overrides,
  };
}

describe("buildTrackHistoryIndex", () => {
  it("marks a track finished only when a completed session exists", () => {
    const index = buildTrackHistoryIndex(
      [session("a"), session("b", { completed: true })],
      [track("a"), track("b")],
    );
    expect(index.a?.finished).toBe(false);
    expect(index.b?.finished).toBe(true);
  });

  it("counts only finalized sessions as plays", () => {
    // An open session has not finished accruing; counting it would make the
    // play count tick up the moment playback starts.
    const index = buildTrackHistoryIndex(
      [session("a"), session("a", { endedAt: null, endPositionSec: null })],
      [track("a")],
    );
    expect(index.a?.playCount).toBe(1);
  });

  it("takes lastPlayedAt from an in-progress session's start", () => {
    const index = buildTrackHistoryIndex(
      [
        session("a", { startedAt: daysAgo(5), endedAt: daysAgo(5) + 1000 }),
        session("a", { startedAt: daysAgo(1), endedAt: null, endPositionSec: null }),
      ],
      [track("a")],
    );
    expect(index.a?.lastPlayedAt).toBe(daysAgo(1));
  });

  it("takes firstPlayedAt from the earliest session", () => {
    const index = buildTrackHistoryIndex(
      [
        session("a", { startedAt: daysAgo(2) }),
        session("a", { startedAt: daysAgo(40) }),
      ],
      [track("a")],
    );
    expect(index.a?.firstPlayedAt).toBe(daysAgo(40));
  });

  it("resumes from the latest ended session, not the furthest reached", () => {
    // Reopening a track and stopping earlier is a deliberate act; resuming at
    // the old high-water mark would skip what the listener went back for.
    const index = buildTrackHistoryIndex(
      [
        session("a", { startedAt: daysAgo(3), endPositionSec: 500 }),
        session("a", { startedAt: daysAgo(1), endPositionSec: 200 }),
      ],
      [track("a", { durationSec: 600 })],
    );
    expect(index.a?.resumeSec).toBe(200);
  });

  it("treats a session that ended at the track's end as nothing to resume", () => {
    const index = buildTrackHistoryIndex(
      [session("a", { endPositionSec: 600 })],
      [track("a", { durationSec: 600 })],
    );
    expect(index.a?.resumeSec).toBe(0);
  });

  it("does not care what order the sessions arrive in", () => {
    const ordered = buildTrackHistoryIndex(
      [session("a", { startedAt: daysAgo(3), endPositionSec: 500 }), session("a", { startedAt: daysAgo(1), endPositionSec: 200 })],
      [track("a")],
    );
    const reversed = buildTrackHistoryIndex(
      [session("a", { startedAt: daysAgo(1), endPositionSec: 200 }), session("a", { startedAt: daysAgo(3), endPositionSec: 500 })],
      [track("a")],
    );
    expect(reversed.a?.resumeSec).toBe(ordered.a?.resumeSec);
  });

  it("omits tracks with no history rather than inventing a zeroed entry", () => {
    const index = buildTrackHistoryIndex([], [track("a")]);
    expect(index.a).toBeUndefined();
  });
});

describe("daysSince and describeRecency", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
    expect(daysSince(NOW + DAY_MS, NOW)).toBe(0);
  });

  it("uses the phrasing a person would", () => {
    expect(describeRecency(NOW, NOW)).toBe("today");
    expect(describeRecency(daysAgo(1), NOW)).toBe("yesterday");
    expect(describeRecency(daysAgo(4), NOW)).toBe("4 days ago");
    expect(describeRecency(daysAgo(9), NOW)).toBe("last week");
    expect(describeRecency(daysAgo(21), NOW)).toBe("3 weeks ago");
    expect(describeRecency(daysAgo(45), NOW)).toBe("last month");
    expect(describeRecency(daysAgo(120), NOW)).toBe("4 months ago");
    expect(describeRecency(daysAgo(800), NOW)).toBe("2 years ago");
  });
});

describe("fillToBudget", () => {
  const candidates = (...remaining: number[]) => remaining.map((remainingSec) => ({ remainingSec }));

  it("takes what fits and keeps scanning past what does not", () => {
    // 1700 is offered first and taken, leaving 100; the 1500 is too big but the
    // 100 still fits. A single-pass pick would have stopped after the first.
    expect(
      fillToBudget(candidates(1700, 1500, 100), 1800).map((c) => c.remainingSec),
    ).toEqual([1700, 100]);
  });

  it("leaves a gap rather than reaching for an exact fill", () => {
    // Deliberate: the goal is "something that fits the journey", not a perfect
    // packing. 1200 wins on length, so the remaining 600 goes unused even
    // though 1100 + 700 would have filled it exactly. The summary reports the
    // spare time, so the trade is visible rather than hidden.
    expect(fillToBudget(candidates(1200, 1100, 700), 1800).map((c) => c.remainingSec)).toEqual([
      1200,
    ]);
  });

  it("returns nothing when the smallest candidate still overflows", () => {
    expect(fillToBudget(candidates(900, 800), 600)).toEqual([]);
  });

  it("fills exactly to the budget without exceeding it", () => {
    const picked = fillToBudget(candidates(600, 600, 600), 1800);
    expect(picked.reduce((total, c) => total + c.remainingSec, 0)).toBe(1800);
  });

  it("accepts an exact fit", () => {
    expect(fillToBudget(candidates(1800), 1800)).toHaveLength(1);
  });

  it("returns nothing for a zero budget", () => {
    expect(fillToBudget(candidates(1), 0)).toEqual([]);
  });
});

describe("buildSmartPlaylist: continue", () => {
  it("offers tracks that were stopped part-way through", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({
        tracks: [track("a"), track("b")],
        sessions: [session("a", { endPositionSec: 120 }), session("b", { endPositionSec: 300 })],
      }),
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["b", "a"]);
    expect(result.picks[1]?.reason).toBe("Left off at 2:00");
  });

  it("ignores a track that was opened but never advanced", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({ tracks: [track("a")], sessions: [session("a", { endPositionSec: 0 })] }),
    );
    expect(result.picks).toEqual([]);
  });

  it("ignores a finished track even if it has a saved position", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({
        tracks: [track("a")],
        sessions: [session("a", { completed: true, endPositionSec: 120 })],
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("ignores a track whose file is missing", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({
        tracks: [track("a", { availability: "missing" })],
        sessions: [session("a", { endPositionSec: 120 })],
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("puts the most recently touched thread first", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({
        tracks: [track("old"), track("new")],
        sessions: [
          session("old", { startedAt: daysAgo(30), endPositionSec: 100 }),
          session("new", { startedAt: daysAgo(2), endPositionSec: 100 }),
        ],
      }),
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["new", "old"]);
  });

  it("caps the list rather than returning the whole library", () => {
    const tracks = Array.from({ length: 20 }, (_, index) => track(`t${index}`));
    const sessions = tracks.map((item) => session(item.id, { endPositionSec: 100 }));
    expect(buildSmartPlaylist("continue", context({ tracks, sessions })).picks).toHaveLength(12);
  });
});

describe("buildSmartPlaylist: series", () => {
  const folder = (key: string) => ({ folderKey: key, folderName: key });

  it("takes the next step after the last finished one", () => {
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [
          track("01", folder("Physics")),
          track("02", folder("Physics")),
          track("03", folder("Physics")),
        ],
        sessions: [session("01", { completed: true })],
      }),
    );
    expect(result.picks[0]?.track.id).toBe("02");
    expect(result.picks[0]?.reason).toBe('Next after "01"');
  });

  it("continues in folder order, not score order", () => {
    // The whole point: a lecture series is only useful in its own sequence.
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [
          track("03", folder("Physics")),
          track("01", folder("Physics")),
          track("02", folder("Physics")),
        ],
      }),
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["01", "02", "03"]);
  });

  it("names the folder for the very first step", () => {
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [track("01", folder("Music/Physics")), track("02", folder("Music/Physics"))],
      }),
    );
    expect(result.picks[0]?.reason).toBe("First in Physics");
  });

  it("skips a folder that is fully finished", () => {
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [track("01", folder("Physics")), track("02", folder("Physics"))],
        sessions: [session("01", { completed: true }), session("02", { completed: true })],
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("ignores single-file folders, which are not a series", () => {
    const result = buildSmartPlaylist(
      "series",
      context({ tracks: [track("lonely", folder("Singles"))] }),
    );
    expect(result.picks).toEqual([]);
  });

  it("ignores tracks with no folder", () => {
    const result = buildSmartPlaylist("series", context({ tracks: [track("a"), track("b")] }));
    expect(result.picks).toEqual([]);
  });

  it("takes a bounded run from each folder so one series cannot fill the list", () => {
    const tracks = Array.from({ length: 10 }, (_, index) =>
      track(`t${index}`, folder("Big")),
    );
    const result = buildSmartPlaylist("series", context({ tracks }));
    expect(result.picks).toHaveLength(3);
  });

  it("orders the most recently worked-through series first", () => {
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [track("a1", folder("Old")), track("a2", folder("Old")), track("b1", folder("Fresh")), track("b2", folder("Fresh"))],
        sessions: [
          session("a1", { startedAt: daysAgo(60) }),
          session("b1", { startedAt: daysAgo(2) }),
        ],
      }),
    );
    // "Old" has its first step finished, so it starts at a2; "Fresh" at b1.
    expect(result.picks[0]?.track.id).toBe("b1");
  });

  it("skips a finished track inside the window rather than replaying it", () => {
    const result = buildSmartPlaylist(
      "series",
      context({
        tracks: [track("01", folder("P")), track("02", folder("P")), track("03", folder("P"))],
        sessions: [session("02", { completed: true })],
      }),
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["01", "03"]);
  });
});

describe("buildSmartPlaylist: commute", () => {
  const minuteTrack = (id: string, minutes: number) => track(id, { durationSec: minutes * 60 });

  it("defaults to a half-hour journey", () => {
    expect(DEFAULT_COMMUTE_BUDGET_SEC).toBe(1800);
    expect(COMMUTE_BUDGETS_SEC).toContain(DEFAULT_COMMUTE_BUDGET_SEC);
  });

  it("drops tracks longer than the whole budget", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [minuteTrack("long", 45), minuteTrack("short", 10)] }),
      { budgetSec: 1800 },
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["short"]);
  });

  it("prefers continuing something over starting something new", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({
        tracks: [minuteTrack("fresh", 20), minuteTrack("half-done", 20)],
        // 10 minutes in, 10 to go — shorter than the fresh 20, so a
        // longest-first rule alone would have picked "fresh".
        sessions: [session("half-done", { endPositionSec: 600 })],
      }),
      { budgetSec: 1800 },
    );
    expect(result.picks[0]?.track.id).toBe("half-done");
    expect(result.picks[0]?.reason).toBe("10m left");
  });

  it("reports the remaining time of a track it is resuming", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({
        tracks: [minuteTrack("a", 30)],
        sessions: [session("a", { endPositionSec: 1500 })],
      }),
      { budgetSec: 1800 },
    );
    expect(result.picks[0]?.reason).toBe("5m left");
  });

  it("counts a never-played track as its full length", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [minuteTrack("a", 10)] }),
      { budgetSec: 1800 },
    );
    expect(result.picks[0]?.reason).toBe("10m");
  });

  it("summarises how much of the budget it used", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [minuteTrack("a", 20)] }),
      { budgetSec: 1800 },
    );
    expect(result.summary).toContain("20m of 30m");
    expect(result.summary).toContain("10m spare");
  });

  it("says nothing about spare time when the fill is tight", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [minuteTrack("a", 29)] }),
      { budgetSec: 1800 },
    );
    expect(result.summary).not.toContain("spare");
  });

  it("skips finished tracks", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({
        tracks: [minuteTrack("done", 10)],
        sessions: [session("done", { completed: true })],
      }),
      { budgetSec: 1800 },
    );
    expect(result.picks).toEqual([]);
  });

  it("explains an empty list in terms of the journey", () => {
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [minuteTrack("long", 60)] }),
      { budgetSec: 900 },
    );
    expect(result.picks).toEqual([]);
    expect(result.emptyReason).toBe("Nothing fits 15m. Try a longer journey.");
  });

  it("excludes a track whose length is not yet known", () => {
    // SAF reports no duration, so `durationSec` can be 0. Claiming such a track
    // "fits your commute" would be a promise we cannot keep.
    const result = buildSmartPlaylist(
      "commute",
      context({ tracks: [track("unknown", { durationSec: 0 })] }),
      { budgetSec: 900 },
    );
    expect(result.picks).toEqual([]);
  });
});

describe("buildSmartPlaylist: forgotten", () => {
  const plays = (id: string, count: number, startedAt: number) =>
    Array.from({ length: count }, (_, index) =>
      session(id, { startedAt: startedAt + index * 1000, endedAt: startedAt + index * 1000 + 100 }),
    );

  it("requires more than one play", () => {
    const result = buildSmartPlaylist(
      "forgotten",
      context({
        tracks: [track("a")],
        sessions: plays("a", 1, daysAgo(90)),
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("requires a real absence", () => {
    const result = buildSmartPlaylist(
      "forgotten",
      context({
        tracks: [track("a")],
        sessions: plays("a", 5, daysAgo(3)),
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("surfaces a well-played, long-absent track", () => {
    const result = buildSmartPlaylist(
      "forgotten",
      context({
        tracks: [track("a")],
        sessions: plays("a", 6, daysAgo(70)),
      }),
    );
    expect(result.picks).toHaveLength(1);
    expect(result.picks[0]?.reason).toBe("6 plays · last heard 2 months ago");
  });

  it("ranks fondness above raw staleness", () => {
    // 15 plays a month ago beats 2 plays a year ago — the point of the
    // logarithm in the score.
    const result = buildSmartPlaylist(
      "forgotten",
      context({
        tracks: [track("barely"), track("beloved")],
        sessions: [
          ...plays("barely", 2, daysAgo(365)),
          ...plays("beloved", 15, daysAgo(30)),
        ],
      }),
    );
    expect(result.picks[0]?.track.id).toBe("beloved");
  });

  it("ignores a track whose file is missing", () => {
    const result = buildSmartPlaylist(
      "forgotten",
      context({
        tracks: [track("a", { availability: "missing" })],
        sessions: plays("a", 5, daysAgo(90)),
      }),
    );
    expect(result.picks).toEqual([]);
  });

  it("says what is missing when nothing qualifies", () => {
    const result = buildSmartPlaylist("forgotten", context({ tracks: [track("a")] }));
    expect(result.emptyReason).toContain("21 days");
  });
});

describe("buildSmartPlaylist: review", () => {
  it("only offers tracks that have notes", () => {
    const result = buildSmartPlaylist(
      "review",
      context({
        tracks: [track("noted"), track("plain")],
        sessions: [session("noted", { startedAt: daysAgo(40) })],
        annotationCounts: { noted: 3 },
      }),
    );
    expect(result.picks.map((pick) => pick.track.id)).toEqual(["noted"]);
    expect(result.picks[0]?.reason).toBe("3 notes · last heard last month");
  });

  it("puts the stalest, most-annotated track first", () => {
    const result = buildSmartPlaylist(
      "review",
      context({
        tracks: [track("fresh"), track("stale")],
        sessions: [
          session("fresh", { startedAt: daysAgo(1) }),
          session("stale", { startedAt: daysAgo(120) }),
        ],
        annotationCounts: { fresh: 2, stale: 2 },
      }),
    );
    expect(result.picks[0]?.track.id).toBe("stale");
  });

  it("handles a note on a track with no listening history", () => {
    const result = buildSmartPlaylist(
      "review",
      context({ tracks: [track("a")], annotationCounts: { a: 2 } }),
    );
    expect(result.picks[0]?.reason).toBe("2 notes");
  });

  it("singularises a single note", () => {
    const result = buildSmartPlaylist(
      "review",
      context({ tracks: [track("a")], annotationCounts: { a: 1 } }),
    );
    expect(result.picks[0]?.reason).toBe("1 note");
  });
});

describe("scoring functions", () => {
  it("forgottenScore weights fondness above staleness", () => {
    expect(forgottenScore(15, 30)).toBeGreaterThan(forgottenScore(2, 365));
  });

  it("forgottenScore grows with both inputs", () => {
    expect(forgottenScore(5, 40)).toBeGreaterThan(forgottenScore(5, 30));
    expect(forgottenScore(6, 40)).toBeGreaterThan(forgottenScore(5, 40));
  });

  it("reviewScore grows with both inputs", () => {
    expect(reviewScore(3, 90)).toBeGreaterThan(reviewScore(3, 10));
    expect(reviewScore(4, 90)).toBeGreaterThan(reviewScore(3, 90));
  });

  it("never goes negative for a clamped day count", () => {
    expect(forgottenScore(3, -5)).toBeGreaterThan(0);
    expect(reviewScore(3, -5)).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("produces an identical order for the same context and day", () => {
    // The list must not reshuffle between renders — the screen rebuilds on every
    // focus, and a moving target would be unusable. Every track here has the
    // same score, so the order is decided entirely by the seeded tie-break.
    const ids = ["a", "b", "c", "d"];
    const ctx = context({
      tracks: ids.map((id) => track(id)),
      sessions: ids.map((id) => session(id, { startedAt: daysAgo(10), endPositionSec: 100 })),
    });
    const build = () => buildSmartPlaylist("continue", ctx).picks.map((pick) => pick.track.id);

    expect(build()).toHaveLength(4);
    expect(build()).toEqual(build());
  });

  it("varies from day to day while staying fixed within a day", () => {
    // If ties resolved by input order the list would be frozen; if they resolved
    // randomly it would reshuffle under the listener's finger. The seed has to
    // give neither.
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const orderFor = (now: number) =>
      buildSmartPlaylist(
        "continue",
        context({
          tracks: ids.map((id) => track(id)),
          sessions: ids.map((id) => session(id, { startedAt: daysAgo(10), endPositionSec: 100 })),
          now,
        }),
      ).picks.map((pick) => pick.track.id);

    expect(orderFor(NOW)).toEqual(orderFor(NOW));

    const acrossDays = [0, 1, 2, 3, 4].map((offset) => orderFor(NOW + offset * DAY_MS).join(","));
    expect(new Set(acrossDays).size).toBeGreaterThan(1);
  });
});

describe("buildSmartPlaylists", () => {
  it("builds every rule over one context", () => {
    const results = buildSmartPlaylists(
      SMART_RULES.map((rule) => rule.id),
      context({ tracks: [track("a")] }),
    );
    expect(results).toHaveLength(SMART_RULES.length);
    expect(results.map((result) => result.rule.id)).toEqual(SMART_RULES.map((rule) => rule.id));
  });

  it("sums the durations of its picks", () => {
    const result = buildSmartPlaylist(
      "continue",
      context({
        tracks: [track("a", { durationSec: 100 }), track("b", { durationSec: 200 })],
        sessions: [
          session("a", { endPositionSec: 50 }),
          session("b", { endPositionSec: 50 }),
        ],
      }),
    );
    expect(result.totalDurationSec).toBe(300);
  });
});

describe("rule registry", () => {
  it("has unique ids", () => {
    const ids = SMART_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every rule a title and a tagline", () => {
    for (const rule of SMART_RULES) {
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.tagline.length).toBeGreaterThan(0);
    }
  });

  it("recognises its own ids and nothing else", () => {
    expect(isSmartRuleId("continue")).toBe(true);
    expect(isSmartRuleId("nope")).toBe(false);
    expect(isSmartRuleId(undefined)).toBe(false);
  });

  it("throws for an unknown rule rather than returning undefined", () => {
    expect(() => ruleFor("nope" as SmartRuleId)).toThrow(/Unknown smart playlist rule/);
  });
});

describe("every rule's empty state", () => {
  const empty = context({ tracks: [] });

  it("explains itself instead of returning a bare empty list", () => {
    for (const rule of SMART_RULES) {
      const result = buildSmartPlaylist(rule.id, empty);
      expect(result.picks).toEqual([]);
      expect(result.emptyReason).toBeTruthy();
      expect(result.summary).toBe("");
    }
  });

  it("clears the empty reason once it finds something", () => {
    const populated = context({
      tracks: [
        track("a", { folderKey: "F", durationSec: 300 }),
        track("b", { folderKey: "F", durationSec: 300 }),
      ],
      sessions: [
        session("a", { endPositionSec: 60 }),
        session("b", { startedAt: daysAgo(60) }),
      ],
      annotationCounts: { a: 1 },
    });
    for (const rule of SMART_RULES) {
      const result = buildSmartPlaylist(rule.id, populated, { budgetSec: 1800 });
      if (result.picks.length > 0) {
        expect(result.emptyReason).toBeNull();
        expect(result.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it("never puts an unplayable track on any list", () => {
    const missing = context({
      tracks: [
        track("gone", { availability: "missing", folderKey: "F", durationSec: 300 }),
        track("also-gone", { availability: "missing", folderKey: "F", durationSec: 300 }),
      ],
      sessions: [
        session("gone", { endPositionSec: 60 }),
        session("also-gone", { startedAt: daysAgo(90) }),
      ],
      annotationCounts: { gone: 4, "also-gone": 4 },
    });
    for (const rule of SMART_RULES) {
      const result = buildSmartPlaylist(rule.id, missing, { budgetSec: 1800 });
      expect(result.picks).toEqual([]);
    }
  });
});
