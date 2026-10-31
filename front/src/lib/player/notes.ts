/**
 * The player's note queue.
 *
 * A note is written to the durable queue first and appears immediately. The
 * server hears about it later through `syncLocalData`; `updateNote` and
 * `deleteNote` are the fast paths, not the only paths. A stable `clientId` is
 * the retry key.
 */

import { deleteNote } from "@/app/actions/player/delete-note";
import { updateNote } from "@/app/actions/player/update-note";
import { queueSync } from "./sync";
import { playerStorage } from "./storage";
import type { QueuedAnnotation } from "./types";

export type PlayerNote = {
  clientId: string;
  serverId: string | null;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
  updatedAt: number;
  /** True until the server has acknowledged the row. */
  pending: boolean;
};

function toNote(record: QueuedAnnotation, serverId: string | null): PlayerNote {
  return {
    clientId: record.clientId,
    serverId,
    contentHash: record.contentHash,
    positionSec: Math.max(0, Math.round(record.positionSec)),
    text: record.text,
    tags: record.tags,
    color: record.color ?? null,
    updatedAt: record.updatedAt,
    pending: true,
  };
}

/** The local half of a track's notes; tombstones are not displayed. */
export function localNotesFor(contentHash: string): PlayerNote[] {
  const storage = playerStorage();
  const ids = storage.getAnnotationIds();
  return storage
    .getAnnotations()
    .filter((row) => row.contentHash === contentHash && !row.deleted)
    .map((row) => toNote(row, ids[row.clientId] ?? row.serverId ?? null));
}

/**
 * Client ids whose local row is a delete tombstone.
 *
 * The server may still return the note until the tombstone syncs; hiding it
 * here is what makes a delete feel immediate without pretending it reached the
 * database.
 */
export function deletedNoteClientIds(contentHash: string): Set<string> {
  return new Set(
    playerStorage()
      .getAnnotations()
      .filter((row) => row.contentHash === contentHash && row.deleted)
      .map((row) => row.clientId),
  );
}

export function localNoteById(clientId: string): PlayerNote | null {
  const storage = playerStorage();
  const record = storage.getAnnotations().find((row) => row.clientId === clientId);
  if (!record || record.deleted) {
    return null;
  }
  const ids = storage.getAnnotationIds();
  return toNote(record, ids[clientId] ?? record.serverId ?? null);
}

/**
 * Make a server-known note addressable by the same edit/delete path as a note
 * created here.
 *
 * Notes made on another device were never in this device's queue. Without a
 * queued shadow a failed fast-path edit would have nowhere to survive, and
 * without the id mapping `editNote` would wrongly treat it as unsynced.
 */
export function ensureNoteQueued(input: {
  clientId: string;
  serverId: string | null;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
}): void {
  const storage = playerStorage();
  if (storage.getAnnotations().some((row) => row.clientId === input.clientId)) {
    return;
  }

  storage.upsertAnnotation({
    clientId: input.clientId,
    contentHash: input.contentHash,
    positionSec: Math.max(0, Math.round(input.positionSec)),
    text: input.text,
    tags: input.tags,
    ...(input.color === null ? {} : { color: input.color }),
    updatedAt: Date.now(),
    deleted: false,
    ...(input.serverId === null ? {} : { serverId: input.serverId }),
  });

  if (input.serverId !== null) {
    storage.setAnnotationId(input.clientId, input.serverId);
  }
}

export function createNote(input: {
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string;
}): PlayerNote {
  const record: QueuedAnnotation = {
    clientId: crypto.randomUUID(),
    contentHash: input.contentHash,
    positionSec: Math.max(0, Math.round(input.positionSec)),
    text: input.text.trim(),
    tags: input.tags,
    color: input.color,
    updatedAt: Date.now(),
    deleted: false,
  };

  playerStorage().upsertAnnotation(record);
  void queueSync("annotation");
  return toNote(record, null);
}

/**
 * Edit locally first. A note the server has never seen is updated in the queued
 * create rather than sent as a second row. A synced note gets the fast path and
 * keeps a queued update if the call fails.
 */
export async function editNote(input: {
  clientId: string;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string;
}): Promise<void> {
  const storage = playerStorage();
  const ids = storage.getAnnotationIds();
  const record = storage.getAnnotations().find((row) => row.clientId === input.clientId);
  const serverId = ids[input.clientId] ?? record?.serverId ?? null;
  const updatedAt = Date.now();

  storage.upsertAnnotation({
    clientId: input.clientId,
    contentHash: input.contentHash,
    positionSec: Math.max(0, Math.round(input.positionSec)),
    text: input.text.trim(),
    tags: input.tags,
    color: input.color,
    updatedAt,
    deleted: false,
    ...(serverId === null ? {} : { serverId }),
  });

  if (serverId === null) {
    void queueSync("annotation");
    return;
  }

  const result = await updateNote({
    annotationId: serverId,
    text: input.text.trim(),
    tags: input.tags,
    color: input.color,
    updatedAt,
  });

  if (result.success) {
    // The fast path landed; the queued copy is redundant. A concurrent sync may
    // already have removed it, which is harmless.
    storage.removeAnnotations([input.clientId]);
  } else {
    void queueSync("annotation");
  }
}

/**
 * Deleting an unsynced note removes the queued create; there is no server row
 * to tombstone. A synced note is tombstoned locally first, then deleted by id.
 */
export async function deletePlayerNote(input: {
  clientId: string;
  contentHash: string;
  positionSec: number;
}): Promise<void> {
  const storage = playerStorage();
  const ids = storage.getAnnotationIds();
  const queued = storage.getAnnotations().find((row) => row.clientId === input.clientId);
  const serverId = ids[input.clientId] ?? queued?.serverId ?? null;

  if (!serverId) {
    storage.removeAnnotations([input.clientId]);
    return;
  }

  storage.upsertAnnotation({
    clientId: input.clientId,
    contentHash: input.contentHash,
    positionSec: Math.max(0, Math.round(input.positionSec)),
    text: "",
    tags: [],
    updatedAt: Date.now(),
    deleted: true,
    serverId,
  });

  const result = await deleteNote(serverId);
  if (result.success) {
    storage.removeAnnotations([input.clientId]);
    storage.removeAnnotationId(input.clientId);
  } else {
    void queueSync("annotation");
  }

  if (queued?.deleted === false && !queued.serverId && !serverId) {
    storage.removeAnnotations([input.clientId]);
  }
}
