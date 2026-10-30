/**
 * The dashboard's folds.
 *
 * These are the numbers the listener reads, so they are the ones worth testing
 * without a backend: a chart that drops an empty day, a streak that counts
 * yesterday, a top-track join that silently loses a row.
 */

import { describe, expect, it } from "vitest";

import { bucketByDay, currentStreak, joinTopTracks, peakOf } from "@/lib/insights";
import type { SessionSummary } from "@/lib/domain/session";
import type { TrackSummary } from "@/lib/domain/track";

const NOW = new Date(2026, 9, 30, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function session(id: string, startedAt: number, durationListenedSec: number): SessionSummary {
  return {
    id,
    contentHash: null,
    startedAt,
    endedAt: startedAt + durationListenedSec * 1000,
    durationListenedSec,
    completed: false,
    interrupted: true,
    seeked: false,
  };
}

function track(contentHash: string, title: string): TrackSummary {
  return {
    id: `id-${contentHash}`,
    contentHash,
    title,
    durationSec: 600,
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    origin: "online",
    sourceId: null,
    externalId: null,
    collectionKey: null,
    collectionTitle: null,
  };
}

describe("bucketByDay", () => {
  it("returns exactly the requested number of buckets, oldest first", () => {
    const buckets = bucketByDay([], 30, NOW);
    expect(buckets).toHaveLength(30);
    expect(buckets[0]!.day).toBeLessThan(buckets[29]!.day);
    // The last bucket is today.
    expect(buckets[29]!.day).toBe(new Date(2026, 9, 30).getTime());
  });

  it("keeps empty days instead of compressing them away", () => {
    const buckets = bucketByDay([session("a", NOW - 5 * DAY, 120)], 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets.filter((bucket) => bucket.listenTimeSec === 0)).toHaveLength(6);
    expect(buckets[1]!.listenTimeSec).toBe(120);
  });

  it("sums several sessions into one day", () => {
    const buckets = bucketByDay(
      [session("a", NOW - 3600_000, 60), session("b", NOW - 1800_000, 90)],
      3,
      NOW,
    );
    expect(buckets[2]!.listenTimeSec).toBe(150);
    expect(buckets[2]!.sessionCount).toBe(2);
  });

  it("ignores a session outside the window", () => {
    const buckets = bucketByDay([session("old", NOW - 90 * DAY, 500)], 7, NOW);
    expect(buckets.every((bucket) => bucket.listenTimeSec === 0)).toBe(true);
  });
});

describe("peakOf", () => {
  it("is zero for no listening and the maximum otherwise", () => {
    expect(peakOf(bucketByDay([], 7, NOW))).toBe(0);
    expect(peakOf(bucketByDay([session("a", NOW, 300)], 7, NOW))).toBe(300);
  });
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    const buckets = bucketByDay(
      [session("a", NOW, 60), session("b", NOW - DAY, 60), session("c", NOW - 2 * DAY, 60)],
      7,
      NOW,
    );
    expect(currentStreak(buckets)).toBe(3);
  });

  it("stops at the first empty day", () => {
    const buckets = bucketByDay([session("a", NOW, 60), session("b", NOW - 2 * DAY, 60)], 7, NOW);
    expect(currentStreak(buckets)).toBe(1);
  });

  it("is zero when today has nothing, even if yesterday did", () => {
    // A streak that survives a day off is not a streak.
    const buckets = bucketByDay([session("a", NOW - DAY, 60)], 7, NOW);
    expect(currentStreak(buckets)).toBe(0);
  });
});

describe("joinTopTracks", () => {
  it("attaches the title by content hash", () => {
    const rows = joinTopTracks(
      [{ contentHash: "h1", listenTimeSec: 600, playCount: 3, lastPlayedAt: NOW }],
      [track("h1", "کتاب اول")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("کتاب اول");
  });

  it("keeps an unmatched hash rather than dropping the listening time", () => {
    const rows = joinTopTracks(
      [{ contentHash: "gone", listenTimeSec: 900, playCount: 1, lastPlayedAt: null }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBeNull();
    expect(rows[0]!.listenTimeSec).toBe(900);
  });

  it("uses the first track when a hash appears twice", () => {
    const rows = joinTopTracks(
      [{ contentHash: "h1", listenTimeSec: 1, playCount: 1, lastPlayedAt: null }],
      [track("h1", "اول"), track("h1", "دوم")],
    );
    expect(rows[0]!.title).toBe("اول");
  });
});
