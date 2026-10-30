"use server";

/**
 * One track, by id.
 *
 * ## `null` means "no such track", and that is not an error
 *
 * `getTrackDetail` is a `findOne` scoped to `"user._id": userId`
 * (`back/src/tracks/getTrackDetail/getTrackDetail.fn.ts`), so it returns `null`
 * — not a failure — for an id that does not exist *and* for one that belongs to
 * somebody else. The page cannot tell those apart and should not: both are
 * "there is nothing here", and both render the same 404.
 *
 * ## A malformed id is the same 404, and never reaches the backend
 *
 * `trackId` is validated as an ObjectId on the server. Sending `"abc"` would
 * come back as a `validation` failure — an *error state*, with a retry button
 * and a technical-details block — for a URL the listener typed wrong. A regex
 * check here turns that into the honest answer before the round trip, and keeps
 * the act's validator for what it is for: catching our own bugs.
 */

import { callAct } from "@/lib/call-act";
import { parseTrackDetail, TRACK_DETAIL_GET, type TrackDetail } from "@/lib/domain/track";
import { ok, type ActResult } from "@/lib/result";

/** Mongo's ObjectId as it appears in a URL. Not exported: `"use server"` modules may only export async functions. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function getTrackDetail(trackId: string): Promise<ActResult<TrackDetail | null>> {
  if (!OBJECT_ID.test(trackId)) {
    return ok(null);
  }

  const result = await callAct("track", "getTrackDetail", {
    set: { trackId },
    get: TRACK_DETAIL_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseTrackDetail(result.body));
}
