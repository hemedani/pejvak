import { describe, expect, it } from "vitest";

import {
  applySyncResponse,
  hasSendableRows,
  prepareSyncBatch,
  syncBackoffMs,
  SYNC_BATCH_SIZE,
} from "../sync-batch";
import type {
  LocalRun,
  QueuedAnnotation,
  QueuedSession,
  SyncResponse,
} from "../types";

function session(overrides: Partial<QueuedSession> = {}): QueuedSession {
  return {
    clientId: "s1",
    contentHash: "registered",
    startedAt: 1,
    endedAt: 2,
    startPositionSec: 0,
    endPositionSec: 10,
    durationListenedSec: 10,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    stretchId: "stretch",
    seeked: false,
    ...overrides,
  };
}

function annotation(overrides: Partial<QueuedAnnotation> = {}): QueuedAnnotation {
  return {
    clientId: "a1",
    contentHash: "registered",
    positionSec: 5,
    text: "note",
    tags: [],
    updatedAt: 1,
    deleted: false,
    ...overrides,
  };
}

function run(overrides: Partial<LocalRun> = {}): LocalRun {
  return {
    clientId: "r1",
    contextType: "online",
    contextKey: "key",
    contextTitle: "Title",
    trackCount: 2,
    startedAt: 1,
    endedAt: 2,
    lastIndex: 0,
    lastTrackId: null,
    lastPositionSec: 0,
    listenedSec: 10,
    finishedCount: 0,
    completed: false,
    interrupted: true,
    updatedAt: 2,
    ...overrides,
  };
}

function response(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    syncedSessions: 0,
    syncedAnnotations: 0,
    syncedContextPlays: 0,
    annotations: [],
    contextPlays: [],
    ...overrides,
  };
}

describe("prepareSyncBatch", () => {
  it("sends only rows whose track is registered", () => {
    const prepared = prepareSyncBatch({
      sessions: [session(), session({ clientId: "s2", contentHash: "missing" })],
      annotations: [annotation(), annotation({ clientId: "a2", contentHash: "missing" })],
      runs: [run({ endedAt: null }), run()],
      registered: ["registered"],
    });

    expect(prepared.batch.sessions).toHaveLength(1);
    expect(prepared.batch.annotations).toHaveLength(1);
    expect(prepared.batch.contextPlays).toHaveLength(1);
  });

  it("puts sessions before notes before runs inside the limit", () => {
    const prepared = prepareSyncBatch(
      {
        sessions: [session(), session({ clientId: "s2" })],
        annotations: [annotation()],
        runs: [run()],
        registered: ["registered"],
      },
      2,
    );

    expect(prepared.batch.sessions).toHaveLength(2);
    expect(prepared.batch.annotations).toHaveLength(0);
    expect(prepared.batch.contextPlays).toHaveLength(0);
  });

  it("sends a tombstone as deleted", () => {
    const prepared = prepareSyncBatch({
      sessions: [],
      annotations: [annotation({ deleted: true })],
      runs: [],
      registered: ["registered"],
    });
    expect(prepared.batch.annotations[0]?.deleted).toBe(true);
  });

  it("caps a batch at the size constant by default", () => {
    const many = Array.from({ length: SYNC_BATCH_SIZE + 5 }, (_, index) =>
      session({ clientId: `s${index}` }),
    );
    const prepared = prepareSyncBatch({
      sessions: many,
      annotations: [],
      runs: [],
      registered: ["registered"],
    });
    expect(prepared.batch.sessions).toHaveLength(SYNC_BATCH_SIZE);
  });

  it("reports whether anything could be sent", () => {
    expect(
      hasSendableRows({
        sessions: [session({ contentHash: "missing" })],
        annotations: [],
        runs: [],
        registered: ["registered"],
      }),
    ).toBe(false);
    expect(
      hasSendableRows({
        sessions: [session()],
        annotations: [],
        runs: [],
        registered: ["registered"],
      }),
    ).toBe(true);
  });
});

describe("applySyncResponse", () => {
  const sent = { sessions: ["s1"], annotations: ["a1"], runs: ["r1"] };

  it("removes only acknowledged rows", () => {
    const result = applySyncResponse(
      response({
        syncedSessions: 1,
        syncedAnnotations: 1,
        annotations: [{ clientId: "a1", serverId: "srv-a1" }],
        contextPlays: [{ clientId: "r1", serverId: "srv-r1" }],
      }),
      sent,
    );

    expect(result.removeSessions).toEqual(["s1"]);
    expect(result.removeAnnotations).toEqual(["a1"]);
    expect(result.removeRuns).toEqual(["r1"]);
    expect(result.annotationMappings).toEqual([{ clientId: "a1", serverId: "srv-a1" }]);
  });

  it("keeps everything after a failed batch", () => {
    const result = applySyncResponse(response(), sent);
    expect(result.removeSessions).toEqual([]);
    expect(result.removeAnnotations).toEqual([]);
    expect(result.removeRuns).toEqual([]);
  });

  it("keeps sessions when the acknowledgement count is short", () => {
    const result = applySyncResponse(response({ syncedSessions: 0 }), sent);
    expect(result.removeSessions).toEqual([]);
  });

  it("never removes an id it did not send", () => {
    const result = applySyncResponse(
      response({
        syncedSessions: 1,
        syncedAnnotations: 1,
        annotations: [{ clientId: "other", serverId: "x" }],
        contextPlays: [{ clientId: "other", serverId: "y" }],
      }),
      sent,
    );
    expect(result.removeAnnotations).toEqual([]);
    expect(result.removeRuns).toEqual([]);
    expect(result.annotationMappings).toEqual([]);
  });

  it("backs off with a bounded schedule", () => {
    expect(syncBackoffMs(0)).toBe(5_000);
    expect(syncBackoffMs(1)).toBe(15_000);
    expect(syncBackoffMs(9)).toBe(300_000);
  });
});
