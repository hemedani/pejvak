"use server";

/**
 * One track's listening sessions, newest first.
 *
 * ## Why this exists when `getTrackDetail` already embeds `sessions`
 *
 * The embedded relation is bounded at 50 and sorted by `_id` **descending**
 * (`models/playbackSession.ts`). `_id` order is *sync* order, not listening
 * order: a phone that was offline for a week uploads a week of sessions in one
 * batch, and every one of them lands at the top of the relation regardless of
 * when it happened. A timeline drawn from that list would put last Tuesday
 * above yesterday and look like a bug in the dates.
 *
 * This act sorts by `startedAt: -1` in the aggregation, which is the order the
 * timeline is read in, and it pages — so "all sessions" is reachable instead of
 * stopping at 50.
 *
 * ## No total
 *
 * The act returns a bare array (`.toArray()`), so there is no count and no
 * "page 3 of 12". `hasMore` is a full page, exactly as in `getMyTracks`.
 */

import { callAct } from "@/lib/call-act";
import {
  parseSessionDetailList,
  SESSION_TIMELINE_GET,
  type SessionDetail,
} from "@/lib/domain/session";
import {
  TRACK_SESSION_PAGE_SIZE,
  type TrackSessionPage,
} from "@/lib/domain/session-query";
import { ok, type ActResult } from "@/lib/result";

/** Mongo's ObjectId as it appears in a URL. Not exported — see `get-track-detail.ts`. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function getTrackSessions(
  trackId: string,
  page = 1,
  limit = TRACK_SESSION_PAGE_SIZE,
): Promise<ActResult<TrackSessionPage>> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));

  if (!OBJECT_ID.test(trackId)) {
    // The track page has already turned a malformed id into a 404, so this is
    // only reachable if a caller asks directly. An empty page is the honest
    // answer: there are no sessions for a track that cannot exist.
    return ok({ sessions: [], page: safePage, limit: safeLimit, hasMore: false });
  }

  const result = await callAct("playbackSession", "getTrackSessions", {
    set: { trackId, page: safePage, limit: safeLimit },
    get: SESSION_TIMELINE_GET,
  });

  if (!result.success) {
    return result;
  }

  const sessions: SessionDetail[] = parseSessionDetailList(result.body);

  return ok({
    sessions,
    page: safePage,
    limit: safeLimit,
    hasMore: sessions.length >= safeLimit,
  });
}
