"use server";

/**
 * The dashboard's numbers.
 *
 * `getMyStats` lives under the **`playbackSession`** model, not a `stats` model
 * — the plan's §2 C3 table lists it as `stats getMyStats`, and the act's own
 * `mod.ts` says `schema: "playbackSession"`. The code is right (plan preamble:
 * "where this plan and the code disagree, the code is right"). Sending
 * `model: "stats"` would fail validation with a message that looks like an auth
 * problem.
 */

import { callAct } from "@/lib/call-act";
import { parseStats, STATS_GET, type ListeningStats } from "@/lib/domain/stats";
import { ok, type ActResult } from "@/lib/result";

export async function getMyStats(): Promise<ActResult<ListeningStats>> {
  const result = await callAct("playbackSession", "getMyStats", {
    set: {},
    get: STATS_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseStats(result.body));
}
