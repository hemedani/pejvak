"use server";

/**
 * The most-listened tracks, ranked by listening time.
 *
 * Not by play count: a track skipped after three seconds is a play. The act's
 * own bounds are 1–365 days and 1–50 rows, and this action keeps them.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseTopTracks,
  TOP_TRACKS_GET,
  type AdminTopTracks,
} from "@/lib/admin/domain/analytics";
import { wholeNumber } from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetTopTracks(
  days = 30,
  limit = 10,
): Promise<ActResult<AdminTopTracks>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("playbackSession", "adminGetTopTracks", {
    set: {
      days: wholeNumber(days, 30, 1, 365),
      limit: wholeNumber(limit, 10, 1, 50),
    },
    get: TOP_TRACKS_GET,
  });

  if (!result.success) {
    return result;
  }

  const tracks = parseTopTracks(result.body);
  if (!tracks) {
    return fail("server", "adminGetTopTracks returned a payload that is not a ranking.");
  }

  return ok(tracks);
}
