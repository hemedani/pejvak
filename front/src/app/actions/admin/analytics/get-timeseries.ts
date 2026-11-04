"use server";

/**
 * Signups, sessions, listening time and active listeners per UTC day.
 *
 * The backend fills empty days with zeros; the chart must not draw a line
 * through a gap. The window is clamped to the act's own 7–90 range.
 */

import { requireSupport } from "@/lib/admin/guard";
import {
  parseTimeseries,
  TIMESERIES_GET,
  type AdminTimeseries,
} from "@/lib/admin/domain/analytics";
import { clampDays } from "@/lib/admin/query";
import { callAct } from "@/lib/call-act";
import { fail, ok, type ActResult } from "@/lib/result";

export async function adminGetTimeseries(
  days = 30,
): Promise<ActResult<AdminTimeseries>> {
  const guard = await requireSupport();
  if (!guard.success) {
    return guard;
  }

  const result = await callAct("playbackSession", "adminGetTimeseries", {
    set: { days: clampDays(days) },
    get: TIMESERIES_GET,
  });

  if (!result.success) {
    return result;
  }

  const series = parseTimeseries(result.body);
  if (!series) {
    return fail("server", "adminGetTimeseries returned a payload that is not a series.");
  }

  return ok(series);
}
