/**
 * The pure half of the sync runner.
 *
 * `syncLocalData` is a batch with an ordering rule and an acknowledgement
 * rule, and both are easier to pin in a pure function than through a network
 * mock:
 *
 *   1. a track is registered before any session or note carrying its hash is
 *      sent — the server cannot attach a row to a track it has never seen;
 *   2. only acknowledged rows are removed, and a session is only acknowledged
 *      as a count, so an ambiguous count keeps every row (the server is
 *      idempotent on `clientId`).
 */

import type {
  IdMapping,
  LocalRun,
  QueuedAnnotation,
  QueuedSession,
  SyncBatch,
  SyncResponse,
} from "./types";

export const SYNC_BATCH_SIZE = 50;

export type SyncSource = {
  sessions: readonly QueuedSession[];
  annotations: readonly QueuedAnnotation[];
  runs: readonly LocalRun[];
  registered: readonly string[];
};

export type SentIds = {
  sessions: string[];
  annotations: string[];
  runs: string[];
};

export type PreparedBatch = {
  batch: SyncBatch;
  sent: SentIds;
};

function wireSession(session: QueuedSession): SyncBatch["sessions"][number] {
  return {
    clientId: session.clientId,
    contentHash: session.contentHash,
    startedAt: Math.round(session.startedAt),
    endedAt: Math.round(session.endedAt),
    startPositionSec: Math.round(session.startPositionSec),
    endPositionSec: Math.round(session.endPositionSec),
    durationListenedSec: Math.round(session.durationListenedSec),
    playbackSpeed: session.playbackSpeed,
    completed: session.completed,
    interrupted: session.interrupted,
    ...(session.deviceInfo === undefined ? {} : { deviceInfo: session.deviceInfo }),
    ...(session.contextPlayId === undefined ? {} : { contextPlayId: session.contextPlayId }),
    ...(session.contextType === undefined ? {} : { contextType: session.contextType }),
    ...(session.contextKey === undefined ? {} : { contextKey: session.contextKey }),
    stretchId: session.stretchId,
    seeked: session.seeked,
  };
}

function wireAnnotation(annotation: QueuedAnnotation): SyncBatch["annotations"][number] {
  return {
    clientId: annotation.clientId,
    contentHash: annotation.contentHash,
    positionSec: Math.round(annotation.positionSec),
    text: annotation.text,
    tags: annotation.tags,
    ...(annotation.color === undefined ? {} : { color: annotation.color }),
    updatedAt: Math.round(annotation.updatedAt),
    deleted: annotation.deleted,
  };
}

function wireRun(run: LocalRun): SyncBatch["contextPlays"][number] {
  return {
    clientId: run.clientId,
    contextType: run.contextType,
    contextKey: run.contextKey,
    contextTitle: run.contextTitle,
    trackCount: Math.round(run.trackCount),
    startedAt: Math.round(run.startedAt),
    endedAt: Math.round(run.endedAt ?? Date.now()),
    lastIndex: Math.round(run.lastIndex),
    ...(run.lastTrackId === null ? {} : { lastTrackId: run.lastTrackId }),
    lastPositionSec: Math.round(run.lastPositionSec),
    listenedSec: Math.round(run.listenedSec),
    finishedCount: Math.round(run.finishedCount),
    completed: run.completed,
    interrupted: run.interrupted,
    updatedAt: Math.round(run.updatedAt),
  };
}

/**
 * Build one batch from the durable queues.
 *
 * Sessions and notes are the priority: they are the product. A run row that
 * waits one batch longer costs nothing, and it is derived from sessions that
 * must arrive first anyway.
 */
export function prepareSyncBatch(source: SyncSource, limit = SYNC_BATCH_SIZE): PreparedBatch {
  const registered = new Set(source.registered);

  const sessions = source.sessions.filter((row) => registered.has(row.contentHash));
  const annotations = source.annotations.filter((row) => registered.has(row.contentHash));
  const runs = source.runs.filter((run) => run.endedAt !== null);

  const sentSessions = sessions.slice(0, limit);
  const remaining = Math.max(0, limit - sentSessions.length);
  const sentAnnotations = annotations.slice(0, remaining);
  const remainingAfterNotes = Math.max(0, remaining - sentAnnotations.length);
  const sentRuns = runs.slice(0, remainingAfterNotes);

  return {
    batch: {
      sessions: sentSessions.map(wireSession),
      annotations: sentAnnotations.map(wireAnnotation),
      contextPlays: sentRuns.map(wireRun),
    },
    sent: {
      sessions: sentSessions.map((row) => row.clientId),
      annotations: sentAnnotations.map((row) => row.clientId),
      runs: sentRuns.map((row) => row.clientId),
    },
  };
}

export type ApplyResponseResult = {
  /** Rows the caller may remove from its durable queues. */
  removeSessions: string[];
  removeAnnotations: string[];
  removeRuns: string[];
  /** Newly known `clientId → serverId` mappings for notes. */
  annotationMappings: IdMapping[];
  /** Newly known run mappings. */
  runMappings: IdMapping[];
};

/**
 * What an acknowledgement actually acknowledges.
 *
 * Notes and runs come back with ids, so they are removed by identity. Sessions
 * come back as a count with no ids. A short count means the server refused or
 * skipped something, so nothing is removed and the rows are retried; a full
 * count removes exactly what was sent.
 */
export function applySyncResponse(
  response: SyncResponse,
  sent: SentIds,
): ApplyResponseResult {
  const annotationIds = new Set(response.annotations.map((mapping) => mapping.clientId));
  const runIds = new Set(response.contextPlays.map((mapping) => mapping.clientId));

  return {
    removeSessions:
      response.syncedSessions >= sent.sessions.length ? [...sent.sessions] : [],
    removeAnnotations: sent.annotations.filter((id) => annotationIds.has(id)),
    removeRuns: sent.runs.filter((id) => runIds.has(id)),
    annotationMappings: response.annotations.filter((mapping) =>
      sent.annotations.includes(mapping.clientId),
    ),
    runMappings: response.contextPlays.filter((mapping) => sent.runs.includes(mapping.clientId)),
  };
}

/** Whether anything in the queue could be sent at all. */
export function hasSendableRows(source: SyncSource): boolean {
  const registered = new Set(source.registered);
  return (
    source.sessions.some((row) => registered.has(row.contentHash)) ||
    source.annotations.some((row) => registered.has(row.contentHash)) ||
    source.runs.some((run) => run.endedAt !== null)
  );
}

/** A bounded backoff: 5 s, 15 s, 60 s, then every 5 minutes. */
export const SYNC_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000] as const;

export function syncBackoffMs(attempt: number): number {
  const index = Math.max(0, Math.min(Math.trunc(attempt), SYNC_BACKOFF_MS.length - 1));
  return SYNC_BACKOFF_MS[index];
}
