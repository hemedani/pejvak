"use server";

/**
 * One `syncLocalData` batch.
 *
 * The client builds the batch (registration has already happened) and removes
 * only what the acknowledgement names. The `get` projection asks for exactly
 * the counts and mappings the runner uses — no session ids, because the act has
 * none to give, and no fields the player does not read.
 */

import { callAct } from "@/lib/call-act";
import { parseSyncResponse } from "@/lib/player/wire";
import type { SyncBatch, SyncResponse } from "@/lib/player/types";
import { ok, type ActResult } from "@/lib/result";

export async function syncPlayerData(batch: SyncBatch): Promise<ActResult<SyncResponse>> {
  const result = await callAct("track", "syncLocalData", {
    set: {
      sessions: batch.sessions,
      annotations: batch.annotations,
      contextPlays: batch.contextPlays,
    },
    get: {
      syncedSessions: 1,
      syncedAnnotations: 1,
      syncedContextPlays: 1,
      annotations: [{ clientId: 1, serverId: 1 }],
      contextPlays: [{ clientId: 1, serverId: 1 }],
    },
  });

  if (!result.success) {
    return result;
  }

  return ok(parseSyncResponse(result.body));
}
