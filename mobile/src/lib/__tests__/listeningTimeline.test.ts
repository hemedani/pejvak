/**
 * The listen-as-a-bar rule.
 *
 * Four promises are pinned here, and each is one a listener would notice:
 *
 *   - **the bar is the track's own length**, so a half-heard file is half filled;
 *   - **a resumed listen starts filled part-way in**, not at the left edge;
 *   - **each track gets its own width**, so a 4-minute song beside a 40-minute
 *     lecture does not take half the bar;
 *   - **the marker and the Resume button are the same number**, or the modal
 *     contradicts itself in two places at once.
 *
 * The fixtures use round numbers on purpose — 600, 300, 1200 — because the
 * arithmetic being checked is a ratio, and a reader should be able to do it in
 * their head against the assertion.
 */

import { buildListeningTimeline, timelineForStretch } from "@/lib/listeningTimeline";
import { groupHistoryIntoStretches, type HistoryItem } from "@/lib/history";
import type { LocalSession } from "@/lib/db/types";

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "s1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    startedAt: 1_000,
    endedAt: 2_000,
    startPositionSec: 0,
    endPositionSec: 300,
    durationListenedSec: 300,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    syncStatus: "pending",
    createdAt: 1_000,
    updatedAt: 2_000,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: "stretch-1",
    seeked: false,
    ...overrides,
  };
}

function item(overrides: Partial<LocalSession> = {}, durationSec = 600): HistoryItem {
  const row = session(overrides);
  return {
    session: row,
    track: {
      id: row.trackId,
      title: `Track ${row.trackId}`,
      author: null,
      contentHash: row.contentHash,
      isAudiobook: false,
      artworkUrl: null,
      durationSec,
    },
    contextTitle: null,
  };
}

const AT_START = { trackId: "t1", positionSec: 0 };

describe("buildListeningTimeline", () => {
  it("fills half a track when half of it was heard", () => {
    const timeline = buildListeningTimeline([item({ endPositionSec: 300 })], AT_START);

    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].from).toBe(0);
    expect(timeline.segments[0].to).toBe(0.5);
    expect(timeline.segments[0].weight).toBe(1);
    expect(timeline.totalDurationSec).toBe(600);
    expect(timeline.heardSec).toBe(300);
    expect(timeline.ratio).toBe(0.5);
  });

  it("starts the fill part-way in when the listen was resumed, not at the left edge", () => {
    // Picked up at 5:00 of a 10:00 track and ran to the end. The point of the
    // bar is that this does not look like a listen from the beginning.
    const timeline = buildListeningTimeline(
      [
        item({
          startPositionSec: 300,
          endPositionSec: 600,
          durationListenedSec: 300,
          completed: true,
        }),
      ],
      { trackId: "t1", positionSec: 300 },
    );

    expect(timeline.segments[0].from).toBe(0.5);
    expect(timeline.segments[0].to).toBe(1);
    expect(timeline.markerRatio).toBe(0.5);
  });

  it("gives each track a width of its own", () => {
    // A 10-minute track, a 10-minute track and a 20-minute one: a quarter, a
    // quarter, a half. Weighting by anything else — one segment per track, equal
    // widths — would draw a 4-minute song as wide as a 40-minute lecture.
    const timeline = buildListeningTimeline(
      [
        item({ id: "s1", trackId: "a" }, 600),
        item({ id: "s2", trackId: "b" }, 600),
        item({ id: "s3", trackId: "c" }, 1200),
      ],
      AT_START,
    );

    expect(timeline.totalDurationSec).toBe(2400);
    expect(timeline.segments.map((segment) => segment.weight)).toEqual([0.25, 0.25, 0.5]);
  });

  it("puts the marker inside the right segment of a stretch", () => {
    // Three equal tracks, and the target is 10:00 into the third one — which is
    // two thirds of the way across it, so 0.6667 + 0.3333 * 0.6667 = 0.8889.
    const timeline = buildListeningTimeline(
      [
        item({ id: "s1", trackId: "a" }, 900),
        item({ id: "s2", trackId: "b" }, 900),
        item({ id: "s3", trackId: "c" }, 900),
      ],
      { trackId: "c", positionSec: 600 },
    );

    expect(timeline.markerRatio).toBeCloseTo(0.8889, 4);
  });

  it("keeps the marker and the resume target the same number", () => {
    // The one promise the modal cannot break: the tick on the bar is where the
    // Resume button seeks to. Both come from the target the caller passed, so a
    // module that derived its own would fail exactly here.
    const target = { trackId: "t1", positionSec: 450 };
    const timeline = buildListeningTimeline(
      [item({ startPositionSec: 0, endPositionSec: 450 })],
      target,
    );

    expect(timeline.markerRatio).toBeCloseTo(target.positionSec / 600, 6);
  });

  it("falls back to the furthest point reached when the track states no length", () => {
    // An online episode before it has been played reports 0. A segment of zero
    // width is invisible, and its share would be a division by nothing.
    const timeline = buildListeningTimeline(
      [item({ endPositionSec: 300, durationListenedSec: 300 }, 0)],
      AT_START,
    );

    expect(timeline.segments[0].durationSec).toBe(300);
    expect(timeline.segments[0].to).toBe(1);
    expect(timeline.segments[0].weight).toBe(1);
  });

  it("reports a replay as more time heard than the track is long, but never overfills the bar", () => {
    // Heard twice: twenty minutes of listening against a ten-minute track. The
    // *bar* clamps — it cannot be more than full — while `heardSec` keeps the
    // truth, because that is the number the caption prints.
    const timeline = buildListeningTimeline(
      [item({ durationListenedSec: 1200, endPositionSec: 600, completed: true })],
      AT_START,
    );

    expect(timeline.heardSec).toBe(1200);
    expect(timeline.ratio).toBe(1);
    expect(timeline.segments[0].to).toBe(1);
  });

  it("draws an open session as a marker with no width, not as a filled bar", () => {
    // A session the tracker has not finalised has no end position. Inventing one
    // would claim the listener heard more than the app knows they did.
    const timeline = buildListeningTimeline(
      [
        item({
          startPositionSec: 90,
          endPositionSec: null,
          durationListenedSec: 90,
          startedAt: 1_000,
        }),
      ],
      { trackId: "t1", positionSec: 90 },
    );

    expect(timeline.segments[0].toSec).toBeNull();
    expect(timeline.segments[0].from).toBeCloseTo(90 / 600, 6);
    expect(timeline.segments[0].to).toBeCloseTo(90 / 600, 6);
    expect(timeline.markerRatio).toBeCloseTo(0.15, 6);
  });

  it("never draws a negative width from an end that precedes its start", () => {
    // A corrupt row. A negative width would paint the fill outside the segment,
    // which reads as a rendering bug rather than as a bad row.
    const timeline = buildListeningTimeline(
      [item({ startPositionSec: 400, endPositionSec: 100 })],
      { trackId: "t1", positionSec: 400 },
    );

    expect(timeline.segments[0].to).toBe(timeline.segments[0].from);
    expect(timeline.segments[0].to).toBeCloseTo(400 / 600, 6);
  });

  it("aggregates the scrubbed flag across a stretch", () => {
    const timeline = buildListeningTimeline(
      [
        item({ id: "s1", trackId: "a" }),
        item({ id: "s2", trackId: "b", seeked: true }),
      ],
      AT_START,
    );

    expect(timeline.seeked).toBe(true);
    expect(timeline.segments.map((segment) => segment.seeked)).toEqual([false, true]);
  });

  it("answers an empty listen with zeros rather than a division by nothing", () => {
    const timeline = buildListeningTimeline([], AT_START);

    expect(timeline.segments).toEqual([]);
    expect(timeline.totalDurationSec).toBe(0);
    expect(timeline.ratio).toBe(0);
    expect(timeline.markerRatio).toBe(0);
  });

  it("leaves the marker at the start when the target is not in the listen", () => {
    // A stretch whose target track has since been removed from the list. Zero is
    // the honest answer — a marker drawn against a track that is not there would
    // be pointing at nothing.
    const timeline = buildListeningTimeline([item({ trackId: "a" })], {
      trackId: "gone",
      positionSec: 120,
    });

    expect(timeline.markerRatio).toBe(0);
  });
});

describe("timelineForStretch", () => {
  it("draws a whole stretch, and marks where the card would resume", () => {
    // The stretch's own rule: unfinished listens resume at the *last* track's
    // end, so the marker belongs in the second segment, not the first.
    const rows = [
      item({ id: "s1", trackId: "a", startPositionSec: 0, endPositionSec: 600, completed: true }),
      item({ id: "s2", trackId: "b", startPositionSec: 0, endPositionSec: 300 }),
    ];
    const [entry] = groupHistoryIntoStretches(rows);

    const timeline = timelineForStretch(entry);

    expect(timeline.segments).toHaveLength(2);
    // Equal durations, so the second segment spans 0.5–1.0 and the marker sits
    // 300/600 of the way across it: 0.5 + 0.5 * 0.5.
    expect(timeline.markerRatio).toBeCloseTo(0.75, 6);
  });
});
