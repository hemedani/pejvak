import type { LocalSession } from "@/lib/db/types";
import {
  buildStretch,
  describeStretchOutcome,
  describeStretchTracks,
  groupSessionsIntoStretches,
  spansTracks,
  stretchResumeTarget,
  stretchResumeTargetSec,
} from "@/lib/listeningStretch";

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
    stretchId: "stretch-1",
    seeked: false,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/**
 * A track heard straight through, as the tracker would have written it: it
 * started at the first second and ran to its end, so the next track could begin.
 */
function heardThrough(overrides: Partial<LocalSession> = {}): LocalSession {
  return session(overrides);
}

describe("buildStretch", () => {
  it("reads a single row as a listen of one track", () => {
    const stretch = buildStretch([session({ id: "s1", trackId: "t1" })]);

    expect(stretch).not.toBeNull();
    expect(stretch?.id).toBe("stretch-1");
    expect(stretch?.trackCount).toBe(1);
    expect(spansTracks(stretch!)).toBe(false);
    expect(describeStretchTracks(stretch!)).toBe("1 track");
  });

  it("spans every track the player got through without a deliberate change", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1", startedAt: 0, endedAt: 60 }),
      heardThrough({ id: "s2", trackId: "t2", startedAt: 60, endedAt: 180 }),
      heardThrough({ id: "s3", trackId: "t3", startedAt: 180, endedAt: 240 }),
    ]);

    expect(stretch?.trackCount).toBe(3);
    expect(stretch?.startTrackId).toBe("t1");
    expect(stretch?.endTrackId).toBe("t3");
    expect(stretch?.startedAt).toBe(0);
    expect(stretch?.endedAt).toBe(240);
    expect(stretch?.listenedSec).toBe(180);
    expect(describeStretchTracks(stretch!)).toBe("3 tracks");
  });

  it("reads the ends by when the rows started, not the order they arrived in", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s3", trackId: "t3", startedAt: 180 }),
      heardThrough({ id: "s1", trackId: "t1", startedAt: 0 }),
      heardThrough({ id: "s2", trackId: "t2", startedAt: 60 }),
    ]);

    expect(stretch?.startTrackId).toBe("t1");
    expect(stretch?.endTrackId).toBe("t3");
    expect(stretch?.members.map((member) => member.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("has no stretch for an empty group", () => {
    expect(buildStretch([])).toBeNull();
  });
});

describe("isComplete", () => {
  it("is true for a listen that began at the first second and reached the last end", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1", startPositionSec: 0 }),
      heardThrough({ id: "s2", trackId: "t2", startPositionSec: 0 }),
    ]);

    expect(stretch?.completed).toBe(true);
    expect(stretch?.isComplete).toBe(true);
    expect(describeStretchOutcome(stretch!)).toBe("complete");
  });

  it("is false when the listen opened part-way into its first track", () => {
    // Opening a book at chapter three and hearing it out is a finished session
    // and is not the book heard through — the first second is what is missing.
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1", startPositionSec: 92 }),
      heardThrough({ id: "s2", trackId: "t2", startPositionSec: 0 }),
    ]);

    expect(stretch?.completed).toBe(true);
    expect(stretch?.isComplete).toBe(false);
    expect(describeStretchOutcome(stretch!)).toBe("finished");
  });

  it("is false when anything was scrubbed anywhere in the listen", () => {
    // One accidental drag of the scrubber is enough, and it is not repairable by
    // scrubbing back: the row is what it is.
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1" }),
      heardThrough({ id: "s2", trackId: "t2", seeked: true }),
    ]);

    expect(stretch?.seeked).toBe(true);
    expect(stretch?.isComplete).toBe(false);
    expect(describeStretchOutcome(stretch!)).toBe("finished");
  });

  it("is false while the listen is still open", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1" }),
      heardThrough({ id: "s2", trackId: "t2", endedAt: null, completed: false }),
    ]);

    expect(stretch?.endedAt).toBeNull();
    expect(stretch?.isComplete).toBe(false);
    expect(describeStretchOutcome(stretch!)).toBe("open");
  });

  it("is false when the last track did not run out", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1" }),
      heardThrough({
        id: "s2",
        trackId: "t2",
        endedAt: 200,
        completed: false,
        interrupted: true,
      }),
    ]);

    expect(stretch?.completed).toBe(false);
    expect(stretch?.isComplete).toBe(false);
    expect(describeStretchOutcome(stretch!)).toBe("interrupted");
  });

  it("treats a single track played straight through as a complete listen", () => {
    const stretch = buildStretch([heardThrough({ id: "s1", trackId: "t1" })]);

    expect(stretch?.isComplete).toBe(true);
  });
});

describe("groupSessionsIntoStretches", () => {
  it("groups by stretch id and returns the newest listen first", () => {
    const stretches = groupSessionsIntoStretches([
      session({ id: "a1", stretchId: "older", startedAt: 0 }),
      session({ id: "b1", stretchId: "newer", startedAt: 900 }),
      session({ id: "b2", stretchId: "newer", startedAt: 960 }),
    ]);

    expect(stretches.map((stretch) => stretch.id)).toEqual(["newer", "older"]);
    expect(stretches[0].trackCount).toBe(2);
    expect(stretches[1].trackCount).toBe(1);
  });

  it("treats a row with no group of its own as a listen of one", () => {
    // Every row written before v10 was backfilled to be its own stretch, and a
    // row whose group was never set reads the same way.
    const stretches = groupSessionsIntoStretches([
      session({ id: "s1", stretchId: "s1" }),
      session({ id: "s2", stretchId: "s2" }),
    ]);

    expect(stretches).toHaveLength(2);
    expect(stretches.every((stretch) => stretch.trackCount === 1)).toBe(true);
  });
});

describe("stretchResumeTarget", () => {
  it("replays a listen heard through from its first track", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1", startPositionSec: 0 }),
      heardThrough({ id: "s2", trackId: "t2" }),
    ]);

    const target = stretchResumeTarget(stretch!);

    expect(target.trackId).toBe("t1");
    expect(target.positionSec).toBe(0);
    expect(stretchResumeTargetSec(stretch!)).toBe(target.positionSec);
  });

  it("continues an unfinished listen on the track it stopped on", () => {
    const stretch = buildStretch([
      heardThrough({ id: "s1", trackId: "t1", completed: false, endPositionSec: 300 }),
      heardThrough({
        id: "s2",
        trackId: "t2",
        completed: false,
        endPositionSec: 430,
      }),
    ]);

    const target = stretchResumeTarget(stretch!);

    expect(target.trackId).toBe("t2");
    expect(target.positionSec).toBe(430);
  });

  it("falls back to the first track's position while the listen is open", () => {
    const stretch = buildStretch([
      heardThrough({
        id: "s1",
        trackId: "t1",
        completed: false,
        endedAt: null,
        endPositionSec: null,
        startPositionSec: 75,
      }),
    ]);

    const target = stretchResumeTarget(stretch!);

    expect(target.trackId).toBe("t1");
    expect(target.positionSec).toBe(75);
  });
});
