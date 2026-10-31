import { describe, expect, it, vi } from "vitest";

import {
  PLAYER_STORAGE_KEYS,
  createPlayerStorage,
  type StorageLike,
} from "../storage";
import type { LocalRun, QueuedAnnotation, QueuedSession } from "../types";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function session(overrides: Partial<QueuedSession> = {}): QueuedSession {
  return {
    clientId: "s1",
    contentHash: "hash",
    startedAt: 1000,
    endedAt: 2000,
    startPositionSec: 0,
    endPositionSec: 42,
    durationListenedSec: 42,
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
    contentHash: "hash",
    positionSec: 30,
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
    contextKey: "source:collection",
    contextTitle: "Collection",
    trackCount: 4,
    startedAt: 1000,
    endedAt: 2000,
    lastIndex: 1,
    lastTrackId: "hash",
    lastPositionSec: 30,
    listenedSec: 60,
    finishedCount: 1,
    completed: false,
    interrupted: true,
    updatedAt: 2000,
    ...overrides,
  };
}

describe("player storage", () => {
  it("round-trips a queued session", () => {
    const store = createPlayerStorage(memoryStorage());
    store.upsertSession(session());
    expect(store.getSessions()).toEqual([session()]);
  });

  it("reuses the client id instead of appending a duplicate", () => {
    const store = createPlayerStorage(memoryStorage());
    store.upsertSession(session());
    store.upsertSession(session({ durationListenedSec: 99 }));
    expect(store.getSessions()).toHaveLength(1);
    expect(store.getSessions()[0]?.durationListenedSec).toBe(99);
  });

  it("ignores a corrupt entry rather than throwing", () => {
    const memory = memoryStorage();
    memory.setItem(PLAYER_STORAGE_KEYS.sessions, "{not json");
    const store = createPlayerStorage(memory);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(store.getSessions()).toEqual([]);
    warn.mockRestore();
  });

  it("drops a row that is not shaped like a session", () => {
    const memory = memoryStorage();
    memory.setItem(
      PLAYER_STORAGE_KEYS.sessions,
      JSON.stringify([{ clientId: "x" }, session()]),
    );
    const store = createPlayerStorage(memory);
    expect(store.getSessions()).toEqual([session()]);
  });

  it("replaces an annotation by client id", () => {
    const store = createPlayerStorage(memoryStorage());
    store.upsertAnnotation(annotation());
    store.upsertAnnotation(annotation({ text: "edited" }));
    expect(store.getAnnotations()).toHaveLength(1);
    expect(store.getAnnotations()[0]?.text).toBe("edited");
  });

  it("keeps tombstoned annotations for the sync runner", () => {
    const store = createPlayerStorage(memoryStorage());
    store.upsertAnnotation(annotation({ deleted: true }));
    expect(store.getAnnotations()).toHaveLength(1);
  });

  it("round-trips the client id to server id map", () => {
    const store = createPlayerStorage(memoryStorage());
    store.setAnnotationId("a1", "server-1");
    expect(store.getAnnotationIds()).toEqual({ a1: "server-1" });
    store.removeAnnotationId("a1");
    expect(store.getAnnotationIds()).toEqual({});
  });

  it("round-trips the checkpoint and clears it", () => {
    const store = createPlayerStorage(memoryStorage());
    store.setCheckpoint({ timestamp: 5000, session: { clientId: "s1" } } as never);
    expect(store.getCheckpoint()?.timestamp).toBe(5000);
    store.setCheckpoint(null);
    expect(store.getCheckpoint()).toBeNull();
  });

  it("round-trips the open run and the ended run queue", () => {
    const store = createPlayerStorage(memoryStorage());
    store.setOpenRun(run({ endedAt: null }));
    expect(store.getOpenRun()?.contextKey).toBe("source:collection");
    store.upsertRun(run());
    expect(store.getRuns()).toHaveLength(1);
    store.removeRuns(["r1"]);
    expect(store.getRuns()).toEqual([]);
  });

  it("accumulates a run tally without duplicating a finished track", () => {
    const store = createPlayerStorage(memoryStorage());
    store.addToRunTally("r1", 30, "h1");
    store.addToRunTally("r1", 20, "h1");
    expect(store.getRunTallies().r1).toEqual({ listenedSec: 50, finishedHashes: ["h1"] });
    store.clearRunTally("r1");
    expect(store.getRunTallies()).toEqual({});
  });

  it("is a no-op without a storage backend", () => {
    const store = createPlayerStorage(null);
    expect(() => store.upsertSession(session())).not.toThrow();
    expect(store.getSessions()).toEqual([]);
  });
});
