import { computeTrackStats } from "@/lib/trackStats";
import type { LocalAnnotation, LocalSession } from "@/lib/db/types";

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "s1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    startedAt: 1000,
    endedAt: 1060,
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

function annotation(id: string): LocalAnnotation {
  return {
    id,
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    positionSec: 10,
    text: "note",
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("computeTrackStats", () => {
  it("returns zeroed stats with no activity", () => {
    expect(computeTrackStats([], [])).toEqual({
      playCount: 0,
      totalListenTimeSec: 0,
      lastPlayedAt: null,
      completionRate: 0,
      annotationCount: 0,
    });
  });

  it("counts only finalized sessions for plays and listen time", () => {
    const stats = computeTrackStats(
      [
        session({ id: "a", endedAt: 1060, durationListenedSec: 60, completed: true }),
        session({
          id: "b",
          startedAt: 2000,
          endedAt: 2120,
          durationListenedSec: 120,
          completed: false,
          interrupted: true,
        }),
        session({ id: "c", startedAt: 3000, endedAt: null, completed: false }),
      ],
      [annotation("a1"), annotation("a2")],
    );

    expect(stats.playCount).toBe(2);
    expect(stats.totalListenTimeSec).toBe(180);
    expect(stats.completionRate).toBe(0.5);
    expect(stats.annotationCount).toBe(2);
  });

  it("uses the most recent session (including open) for last played", () => {
    const stats = computeTrackStats(
      [
        session({ id: "a", startedAt: 1000, endedAt: 1060 }),
        session({ id: "open", startedAt: 5000, endedAt: null, completed: false }),
      ],
      [],
    );

    expect(stats.lastPlayedAt).toBe(5000);
  });
});
