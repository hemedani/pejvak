/**
 * The browser's write-ahead log.
 *
 * There is no SQLite here, and the durable guarantee is different: a synchronous
 * `localStorage` write on `pagehide` is what survives a closed tab. The records
 * are small — a row per session, note, run, and pending track — and the store is
 * a **queue**, not a mirror of server state. Once the server acknowledges a row,
 * it is removed.
 *
 * Parsing is defensive in one direction only: a corrupt entry is dropped, never
 * repaired into a row the server might accept. A dropped entry is a lost listen;
 * a fabricated one is a wrong statistic, which is worse for a product whose
 * whole point is honest history.
 */

import type {
  LocalRun,
  PendingTrack,
  QueuedAnnotation,
  QueuedSession,
  RunTally,
  SessionCheckpoint,
} from "./types";

const PREFIX = "pejvak.player.v1.";

export const PLAYER_STORAGE_KEYS = {
  tracks: `${PREFIX}tracks`,
  sessions: `${PREFIX}sessions`,
  annotations: `${PREFIX}annotations`,
  runs: `${PREFIX}runs`,
  openRun: `${PREFIX}openRun`,
  checkpoint: `${PREFIX}checkpoint`,
  registered: `${PREFIX}registered`,
  runTallies: `${PREFIX}runTallies`,
  annotationIds: `${PREFIX}annotationIds`,
} as const;

/** The slice of `Storage` this module needs, so tests can supply a map. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function readJson<T>(storage: StorageLike | null, key: string, fallback: T): T {
  if (!storage) {
    return fallback;
  }
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    // Development-only visibility; a corrupt entry must never stop playback.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[player] dropped corrupt storage entry ${key}`);
    }
    return fallback;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota is a reason to sync sooner, not to break the player. The
    // in-memory session still finalizes; the next write may succeed.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[player] could not persist ${key}`);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSession(value: unknown): value is QueuedSession {
  const row = asRecord(value);
  return Boolean(
    row &&
      typeof row.clientId === "string" &&
      typeof row.contentHash === "string" &&
      isFiniteNumber(row.startedAt) &&
      isFiniteNumber(row.endedAt),
  );
}

function isAnnotation(value: unknown): value is QueuedAnnotation {
  const row = asRecord(value);
  return Boolean(
    row &&
      typeof row.clientId === "string" &&
      typeof row.contentHash === "string" &&
      isFiniteNumber(row.positionSec) &&
      isFiniteNumber(row.updatedAt) &&
      typeof row.text === "string" &&
      Array.isArray(row.tags) &&
      typeof row.deleted === "boolean",
  );
}

function isRun(value: unknown): value is LocalRun {
  const row = asRecord(value);
  return Boolean(
    row &&
      typeof row.clientId === "string" &&
      typeof row.contextKey === "string" &&
      isFiniteNumber(row.startedAt),
  );
}

function isPendingTrack(value: unknown): value is PendingTrack {
  const row = asRecord(value);
  return Boolean(
    row &&
      typeof row.contentHash === "string" &&
      typeof row.title === "string" &&
      typeof row.sourceId === "string" &&
      typeof row.externalId === "string",
  );
}

function isCheckpoint(value: unknown): value is SessionCheckpoint {
  const row = asRecord(value);
  const session = asRecord(row?.session);
  return Boolean(
    row && session && isFiniteNumber(row.timestamp) && typeof session.clientId === "string",
  );
}

export type PlayerStorage = ReturnType<typeof createPlayerStorage>;

export function createPlayerStorage(storage: StorageLike | null) {
  function readList<T>(key: string, guard: (value: unknown) => value is T): T[] {
    const raw = readJson<unknown>(storage, key, []);
    return Array.isArray(raw) ? raw.filter(guard) : [];
  }

  return {
    // ── pending registerTrack rows ───────────────────────────────────────
    getPendingTracks(): PendingTrack[] {
      const raw = readJson<unknown>(storage, PLAYER_STORAGE_KEYS.tracks, []);
      return Array.isArray(raw) ? raw.filter(isPendingTrack) : [];
    },

    upsertPendingTrack(track: PendingTrack): void {
      const rows = this.getPendingTracks().filter(
        (row) => row.contentHash !== track.contentHash,
      );
      rows.push(track);
      writeJson(storage, PLAYER_STORAGE_KEYS.tracks, rows);
    },

    removePendingTrack(contentHash: string): void {
      writeJson(
        storage,
        PLAYER_STORAGE_KEYS.tracks,
        this.getPendingTracks().filter((row) => row.contentHash !== contentHash),
      );
    },

    // ── acknowledged content hashes ──────────────────────────────────────
    getRegistered(): string[] {
      const raw = readJson<unknown>(storage, PLAYER_STORAGE_KEYS.registered, []);
      return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
    },

    isRegistered(contentHash: string): boolean {
      return this.getRegistered().includes(contentHash);
    },

    markRegistered(contentHash: string): void {
      const rows = this.getRegistered();
      if (!rows.includes(contentHash)) {
        rows.push(contentHash);
        writeJson(storage, PLAYER_STORAGE_KEYS.registered, rows);
      }
    },

    // ── sessions ─────────────────────────────────────────────────────────
    getSessions(): QueuedSession[] {
      return readList(PLAYER_STORAGE_KEYS.sessions, isSession);
    },

    upsertSession(session: QueuedSession): void {
      const rows = this.getSessions().filter((row) => row.clientId !== session.clientId);
      rows.push(session);
      writeJson(storage, PLAYER_STORAGE_KEYS.sessions, rows);
    },

    removeSessions(clientIds: readonly string[]): void {
      const remove = new Set(clientIds);
      writeJson(
        storage,
        PLAYER_STORAGE_KEYS.sessions,
        this.getSessions().filter((row) => !remove.has(row.clientId)),
      );
    },

    // ── annotations ──────────────────────────────────────────────────────
    getAnnotations(): QueuedAnnotation[] {
      return readList(PLAYER_STORAGE_KEYS.annotations, isAnnotation);
    },

    upsertAnnotation(annotation: QueuedAnnotation): void {
      const rows = this.getAnnotations().filter(
        (row) => row.clientId !== annotation.clientId,
      );
      rows.push(annotation);
      writeJson(storage, PLAYER_STORAGE_KEYS.annotations, rows);
    },

    removeAnnotations(clientIds: readonly string[]): void {
      const remove = new Set(clientIds);
      writeJson(
        storage,
        PLAYER_STORAGE_KEYS.annotations,
        this.getAnnotations().filter((row) => !remove.has(row.clientId)),
      );
    },

    /**
     * `clientId → serverId` for notes the server has acknowledged.
     *
     * The queue row is removed on ack, so this is the only handle a later edit
     * or delete has to the server row. It is keyed by the stable `clientId`, not
     * by the temp id the UI showed.
     */
    getAnnotationIds(): Record<string, string> {
      const record = asRecord(readJson<unknown>(storage, PLAYER_STORAGE_KEYS.annotationIds, {}));
      if (!record) {
        return {};
      }
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "string") {
          out[key] = value;
        }
      }
      return out;
    },

    setAnnotationId(clientId: string, serverId: string): void {
      const ids = this.getAnnotationIds();
      ids[clientId] = serverId;
      writeJson(storage, PLAYER_STORAGE_KEYS.annotationIds, ids);
    },

    removeAnnotationId(clientId: string): void {
      const ids = this.getAnnotationIds();
      delete ids[clientId];
      writeJson(storage, PLAYER_STORAGE_KEYS.annotationIds, ids);
    },

    // ── ended runs ───────────────────────────────────────────────────────
    getRuns(): LocalRun[] {
      return readList(PLAYER_STORAGE_KEYS.runs, isRun);
    },

    upsertRun(run: LocalRun): void {
      const rows = this.getRuns().filter((row) => row.clientId !== run.clientId);
      rows.push(run);
      writeJson(storage, PLAYER_STORAGE_KEYS.runs, rows);
    },

    removeRuns(clientIds: readonly string[]): void {
      const remove = new Set(clientIds);
      writeJson(
        storage,
        PLAYER_STORAGE_KEYS.runs,
        this.getRuns().filter((row) => !remove.has(row.clientId)),
      );
    },

    // ── the single open run ──────────────────────────────────────────────
    getOpenRun(): LocalRun | null {
      const raw = readJson<unknown>(storage, PLAYER_STORAGE_KEYS.openRun, null);
      return isRun(raw) ? raw : null;
    },

    setOpenRun(run: LocalRun | null): void {
      if (run === null) {
        storage?.removeItem(PLAYER_STORAGE_KEYS.openRun);
        return;
      }
      writeJson(storage, PLAYER_STORAGE_KEYS.openRun, run);
    },

    // ── the active session checkpoint ────────────────────────────────────
    getCheckpoint(): SessionCheckpoint | null {
      const raw = readJson<unknown>(storage, PLAYER_STORAGE_KEYS.checkpoint, null);
      return isCheckpoint(raw) ? raw : null;
    },

    setCheckpoint(checkpoint: SessionCheckpoint | null): void {
      if (checkpoint === null) {
        storage?.removeItem(PLAYER_STORAGE_KEYS.checkpoint);
        return;
      }
      writeJson(storage, PLAYER_STORAGE_KEYS.checkpoint, checkpoint);
    },

    // ── run tallies ──────────────────────────────────────────────────────
    getRunTallies(): Record<string, RunTally> {
      const raw = readJson<unknown>(storage, PLAYER_STORAGE_KEYS.runTallies, {});
      const record = asRecord(raw);
      if (!record) {
        return {};
      }
      const out: Record<string, RunTally> = {};
      for (const [key, value] of Object.entries(record)) {
        const tally = asRecord(value);
        if (!tally || !isFiniteNumber(tally.listenedSec) || !Array.isArray(tally.finishedHashes)) {
          continue;
        }
        out[key] = {
          listenedSec: Math.max(0, Math.round(tally.listenedSec)),
          finishedHashes: tally.finishedHashes.filter(
            (hash): hash is string => typeof hash === "string",
          ),
        };
      }
      return out;
    },

    addToRunTally(runClientId: string, listenedSec: number, finishedHash: string | null): void {
      const tallies = this.getRunTallies();
      const current = tallies[runClientId] ?? { listenedSec: 0, finishedHashes: [] };
      const finished = new Set(current.finishedHashes);
      if (finishedHash) {
        finished.add(finishedHash);
      }
      tallies[runClientId] = {
        listenedSec: Math.max(0, Math.round(current.listenedSec + listenedSec)),
        finishedHashes: [...finished],
      };
      writeJson(storage, PLAYER_STORAGE_KEYS.runTallies, tallies);
    },

    clearRunTally(runClientId: string): void {
      const tallies = this.getRunTallies();
      delete tallies[runClientId];
      writeJson(storage, PLAYER_STORAGE_KEYS.runTallies, tallies);
    },
  };
}

let singleton: PlayerStorage | null = null;

/** The tab's storage. On the server there is none, and every method is a no-op. */
export function playerStorage(): PlayerStorage {
  if (!singleton) {
    singleton = createPlayerStorage(typeof window === "undefined" ? null : window.localStorage);
  }
  return singleton;
}
