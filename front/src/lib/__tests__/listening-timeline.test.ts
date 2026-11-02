/**
 * The listening timeline.
 *
 * The bar is arithmetic over rows the page already read, so these tests can pin
 * the two things that would make it lie: a fill that claims a span nobody heard,
 * and a resume marker that disagrees with the button beside it.
 */

import { describe, expect, it } from "vitest";

import type { HistorySession, HistoryTrack } from "@/lib/domain/history";
import { buildStretch } from "@/lib/history";
import { buildListeningTimeline, timelineForStretch } from "@/lib/listeningTimeline";

function track(overrides: Partial<HistoryTrack> = {}): HistoryTrack {
  return {
    id: "track-1",
    contentHash: "hash-1",
    title: "Chapter one",
    durationSec: 600,
    author: null,
    narrator: null,
    artworkUrl: null,
    origin: "online",
    sourceId: "archive",
    externalId: "ext-1",
    collectionKey: "archive:col-1",
    collectionTitle: "A book",
    ...overrides,
  };
}

function session(
  overrides: Partial<HistorySession> & { id: string; startedAt: number },
): HistorySession {
  return {
    contentHash: "hash-1",
    track: track(),
    endedAt: overrides.startedAt + 60_000,
    startPositionSec: 0,
    endPositionSec: 60,
    durationListenedSec: 60,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    seeked: false,
    stretchId: "stretch-1",
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    ...overrides,
  };
}

const NOW = 1_700_000_000_000;

describe("buildListeningTimeline", () => {
  it("weights each segment by the track's own length", () => {
    const members = [
      session({ id: "a", startedAt: NOW, track: track({ id: "t1", durationSec: 600 }) }),
      session({ id: "b", startedAt: NOW + 1, track: track({ id: "t2", durationSec: 300 }) }),
      session({ id: "c", startedAt: NOW + 2, track: track({ id: "t3", durationSec: 100 }) }),
    ];

    const timeline = buildListeningTimeline(members, {
      trackId: "t1",
      contentHash: "hash-1",
      positionSec: 0,
    });

    expect(timeline.totalDurationSec).toBe(1000);
    expect(timeline.segments.map((segment) => segment.weight)).toEqual([0.6, 0.3, 0.1]);
    expect(timeline.segments.reduce((total, segment) => total + segment.weight, 0)).toBeCloseTo(1, 10);
  });

  it("fills only the part that was heard", () => {
    const [segment] = buildListeningTimeline(
      [session({ id: "a", startedAt: NOW, startPositionSec: 150, endPositionSec: 300 })],
      { trackId: "track-1", contentHash: "hash-1", positionSec: 300 },
    ).segments;

    expect(segment?.from).toBeCloseTo(0.25, 10);
    expect(segment?.to).toBeCloseTo(0.5, 10);
  });

  it("walks the marker into the middle of the middle segment", () => {
    const members = [
      session({ id: "a", startedAt: NOW, track: track({ id: "t1", durationSec: 600 }) }),
      session({ id: "b", startedAt: NOW + 1, track: track({ id: "t2", durationSec: 300 }) }),
      session({ id: "c", startedAt: NOW + 2, track: track({ id: "t3", durationSec: 100 }) }),
    ];

    const timeline = buildListeningTimeline(members, {
      trackId: "t2",
      contentHash: "hash-1",
      positionSec: 150,
    });

    // 0.6 of the bar before it, then half of a 0.3-wide segment.
    expect(timeline.markerRatio).toBeCloseTo(0.75, 10);
  });

  it("draws nothing for a session that has not ended", () => {
    const [segment] = buildListeningTimeline(
      [session({ id: "a", startedAt: NOW, endedAt: null, endPositionSec: 240 })],
      { trackId: "track-1", contentHash: "hash-1", positionSec: 240 },
    ).segments;

    expect(segment?.toSec).toBeNull();
    expect(segment?.to).toBe(segment?.from);
  });

  it("flags a scrubbed segment, and the whole timeline", () => {
    const timeline = buildListeningTimeline(
      [
        session({ id: "a", startedAt: NOW }),
        session({ id: "b", startedAt: NOW + 1, seeked: true }),
      ],
      { trackId: "track-1", contentHash: "hash-1", positionSec: 10 },
    );

    expect(timeline.seeked).toBe(true);
    expect(timeline.segments[1]?.seeked).toBe(true);
    expect(timeline.segments[0]?.seeked).toBe(false);
  });

  it("keeps a deleted track's segment and finds it by hash", () => {
    const timeline = buildListeningTimeline(
      [
        session({
          id: "a",
          startedAt: NOW,
          track: null,
          contentHash: "gone",
          endPositionSec: 600,
        }),
      ],
      { trackId: null, contentHash: "gone", positionSec: 300 },
    );

    expect(timeline.segments[0]?.title).toBe("Deleted track");
    expect(timeline.segments[0]?.trackId).toBeNull();
    // 300 of 600 seconds on the only segment.
    expect(timeline.markerRatio).toBeCloseTo(0.5, 10);
  });

  it("borrows the furthest position when the source never stated a length", () => {
    const [segment] = buildListeningTimeline(
      [
        session({
          id: "a",
          startedAt: NOW,
          track: track({ durationSec: 0 }),
          startPositionSec: 0,
          endPositionSec: 120,
        }),
      ],
      { trackId: "track-1", contentHash: "hash-1", positionSec: 120 },
    ).segments;

    expect(segment?.durationSec).toBe(120);
    expect(segment?.to).toBe(1);
  });

  it("reports replay time as heard, but clamps the drawn ratio", () => {
    const timeline = buildListeningTimeline(
      [
        session({
          id: "a",
          startedAt: NOW,
          durationListenedSec: 900,
          track: track({ durationSec: 600 }),
        }),
      ],
      { trackId: "track-1", contentHash: "hash-1", positionSec: 0 },
    );

    expect(timeline.heardSec).toBe(900);
    expect(timeline.ratio).toBe(1);
  });

  it("survives an empty listen", () => {
    const timeline = buildListeningTimeline([], {
      trackId: "x",
      contentHash: "y",
      positionSec: 0,
    });
    expect(timeline.segments).toEqual([]);
    expect(timeline.ratio).toBe(0);
    expect(timeline.markerRatio).toBe(0);
  });
});

describe("timelineForStretch", () => {
  it("puts the marker where the row's own resume button would seek", () => {
    const members = [
      session({
        id: "a",
        startedAt: NOW,
        stretchId: "s1",
        track: track({ id: "t1", durationSec: 600 }),
        startPositionSec: 0,
        endPositionSec: 600,
        completed: true,
        durationListenedSec: 600,
      }),
      session({
        id: "b",
        startedAt: NOW + 1,
        stretchId: "s1",
        track: track({ id: "t2", durationSec: 300 }),
        startPositionSec: 0,
        endPositionSec: 120,
        durationListenedSec: 120,
      }),
    ];

    const stretch = buildStretch(members);
    expect(stretch).not.toBeNull();
    if (!stretch) {
      return;
    }

    const timeline = timelineForStretch(stretch);
    // Not completed, so the row continues on the last track at 2:00 — 40% of a
    // 300/900-wide segment, after 600/900 of the bar.
    expect(timeline.markerRatio).toBeCloseTo(600 / 900 + (300 / 900) * 0.4, 10);
    expect(timeline.segments).toHaveLength(2);
  });

  it("replays a completed stretch from where it began", () => {
    const members = [
      session({
        id: "a",
        startedAt: NOW,
        stretchId: "s1",
        track: track({ id: "t1", durationSec: 600 }),
        startPositionSec: 0,
        endPositionSec: 600,
        completed: true,
      }),
    ];

    const stretch = buildStretch(members);
    if (!stretch) {
      throw new Error("expected a stretch");
    }

    expect(timelineForStretch(stretch).markerRatio).toBeCloseTo(0, 10);
  });
});
