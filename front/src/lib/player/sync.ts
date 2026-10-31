/**
 * The sync runner.
 *
 * One in-flight batch at a time. Triggers that arrive during a sync set a
 * "run again" flag rather than starting a second overlapping batch; `clientId`
 * makes a repeated batch harmless, but two concurrent ones would race the
 * queue removals.
 *
 * Sync is never a blocking UI error. The player stays fully usable while rows
 * wait, and the retry is bounded: 5 s, 15 s, 60 s, then every five minutes.
 */

import { registerTrackForPlayer } from "@/app/actions/player/register-track";
import { syncPlayerData } from "@/app/actions/player/sync-player-data";
import { usePlayerStore } from "@/stores/player";

import { playerStorage } from "./storage";
import {
  applySyncResponse,
  prepareSyncBatch,
  syncBackoffMs,
  type SentIds,
} from "./sync-batch";

type SyncState = {
  pending: number;
  syncing: boolean;
  failed: boolean;
};

type SyncListener = (state: SyncState) => void;

let inFlight = false;
let runAgain = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let triggersStarted = false;
const listeners = new Set<SyncListener>();
let state: SyncState = { pending: 0, syncing: false, failed: false };

function publish(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener(state);
  }
}

function pendingCount(): number {
  const storage = playerStorage();
  return (
    storage.getPendingTracks().length +
    storage.getSessions().length +
    storage.getAnnotations().length +
    storage.getRuns().length
  );
}

export function subscribeSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

function scheduleRetry(): void {
  if (typeof window === "undefined" || retryTimer !== null) {
    return;
  }
  const delay = syncBackoffMs(attempt);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runSync();
  }, delay);
}

/** Register every pending track; stop at the first failure and keep the row. */
async function registerPending(): Promise<Set<string>> {
  const storage = playerStorage();
  const registered = new Set(storage.getRegistered());
  const pending = storage.getPendingTracks();

  for (const track of pending) {
    if (registered.has(track.contentHash)) {
      storage.removePendingTrack(track.contentHash);
      continue;
    }

    const result = await registerTrackForPlayer(track);
    if (!result.success) {
      // A validation failure is not going to improve by retrying, but keeping
      // the row is still the honest response: the session that depends on it is
      // real, and a later fix can register it.
      return registered;
    }

    if (result.body) {
      registered.add(track.contentHash);
      storage.markRegistered(track.contentHash);
      storage.removePendingTrack(track.contentHash);
      usePlayerStore.getState().setServerId(track.contentHash, result.body);
    } else {
      return registered;
    }
  }

  return registered;
}

function removeAcknowledged(
  sent: SentIds,
  response: Awaited<ReturnType<typeof syncPlayerData>>,
): void {
  if (!response.success) {
    return;
  }

  const storage = playerStorage();
  const before = storage.getAnnotations();
  const result = applySyncResponse(response.body, sent);

  storage.removeSessions(result.removeSessions);

  for (const mapping of result.annotationMappings) {
    const record = before.find((row) => row.clientId === mapping.clientId);
    if (record?.deleted) {
      storage.removeAnnotationId(mapping.clientId);
    } else {
      storage.setAnnotationId(mapping.clientId, mapping.serverId);
    }
  }

  storage.removeAnnotations(result.removeAnnotations);
  storage.removeRuns(result.removeRuns);
}

async function drain(): Promise<boolean> {
  const storage = playerStorage();
  for (let round = 0; round < 5; round += 1) {
    const registered = await registerPending();
    const prepared = prepareSyncBatch({
      sessions: storage.getSessions(),
      annotations: storage.getAnnotations(),
      runs: storage.getRuns(),
      registered: [...registered],
    });

    const { batch, sent } = prepared;
    const total = batch.sessions.length + batch.annotations.length + batch.contextPlays.length;
    if (total === 0) {
      return true;
    }

    const response = await syncPlayerData(batch);
    if (!response.success) {
      return false;
    }

    removeAcknowledged(sent, response);
  }

  return true;
}

/**
 * Safe to call after every event. The single-flight guard makes repeated calls
 * a no-op, and a failure schedules one bounded retry.
 */
export async function runSync(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  if (inFlight) {
    runAgain = true;
    return;
  }

  inFlight = true;
  publish({ syncing: true, pending: pendingCount() });

  let ok = true;
  try {
    ok = await drain();
  } catch {
    ok = false;
  } finally {
    inFlight = false;
    publish({ syncing: false, failed: !ok, pending: pendingCount() });
  }

  if (ok) {
    attempt = 0;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  } else {
    scheduleRetry();
  }

  if (runAgain) {
    runAgain = false;
    void runSync();
  }
}

/** A short reason for a Settings line; never a dialog. */
export async function queueSync(_reason: string): Promise<void> {
  await runSync();
}

/** Boot, online, and visibility triggers. Idempotent. */
export function startSyncTriggers(): void {
  if (triggersStarted || typeof window === "undefined") {
    return;
  }
  triggersStarted = true;

  window.addEventListener("online", () => {
    attempt = 0;
    void runSync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void runSync();
    }
  });
}
