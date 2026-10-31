/**
 * Defensive readers for the two player acts whose replies are structural.
 *
 * Kept out of the `"use server"` modules because a server-action file may export
 * only async functions (`front/AGENTS.md`), and because these are the one place
 * where an unrecognised reply becomes a typed value.
 */

import { asArray, asInt, asRecord, asString } from "../parse";
import type { IdMapping, SyncResponse } from "./types";

function parseMappings(value: unknown): IdMapping[] {
  return asArray(value)
    .map((raw) => {
      const record = asRecord(raw);
      const clientId = asString(record?.clientId);
      const serverId = asString(record?.serverId);
      return clientId && serverId ? { clientId, serverId } : null;
    })
    .filter((mapping): mapping is IdMapping => mapping !== null);
}

/**
 * A missing count is zero; a missing mapping list is empty. The server's
 * acknowledgement is the only evidence a row may be removed, so a reply shaped
 * differently from the projection keeps the queue rather than clearing it.
 */
export function parseSyncResponse(raw: unknown): SyncResponse {
  const record = asRecord(raw);
  return {
    syncedSessions: asInt(record?.syncedSessions) ?? 0,
    syncedAnnotations: asInt(record?.syncedAnnotations) ?? 0,
    syncedContextPlays: asInt(record?.syncedContextPlays) ?? 0,
    annotations: parseMappings(record?.annotations),
    contextPlays: parseMappings(record?.contextPlays),
  };
}

/** `_id` from a `registerTrack` reply; null when the projection lost it. */
export function parseRegisteredTrackId(raw: unknown): string | null {
  return asString(asRecord(raw)?._id);
}
