"use server";

/**
 * Sessions inside a window, newest first.
 *
 * Exists for one surface: the dashboard's per-day chart. `getMyStats` gives
 * totals over all time and no buckets, and adding buckets to it would put a
 * second aggregation of the same rows in a second act — so the chart folds the
 * rows the history act already returns.
 *
 * `from`/`to` are filtered server-side (the act supports them), which is the
 * difference between fetching thirty days and fetching every session the
 * listener has ever recorded.
 */

import { callAct } from "@/lib/call-act";
import { parseSessionList, SESSION_SUMMARY_GET, type SessionSummary } from "@/lib/domain/session";
import { SESSION_WINDOW_LIMIT, type SessionWindow } from "@/lib/domain/session-query";
import { ok, type ActResult } from "@/lib/result";

export async function getSessionsInWindow(
  window: SessionWindow,
): Promise<ActResult<SessionSummary[]>> {
  const result = await callAct("playbackSession", "getMyListeningHistory", {
    set: {
      page: 1,
      limit: Math.min(window.limit ?? SESSION_WINDOW_LIMIT, SESSION_WINDOW_LIMIT),
      from: Math.floor(window.from),
      ...(window.to === undefined ? {} : { to: Math.floor(window.to) }),
    },
    get: SESSION_SUMMARY_GET,
  });

  if (!result.success) {
    return result;
  }

  return ok(parseSessionList(result.body));
}
