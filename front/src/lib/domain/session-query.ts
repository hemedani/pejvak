/**
 * How much of a listening history one read asks for.
 *
 * Same placement rule as `track-query.ts`: constants and types cannot be
 * exported from a `"use server"` module, so they live here and the actions
 * import them.
 */

import type { SessionDetail } from "./session";

/**
 * A ceiling on "sessions in a window", because a window is a date range and not
 * a row count.
 *
 * A listener who listens in twenty short sessions a day still lands under this.
 * If they do not, the chart is drawn from the most recent 1000 — a shape that is
 * correct for the recent past, which is what a thirty-day chart is for.
 */
export const SESSION_WINDOW_LIMIT = 1000;

/**
 * One page of a track's session timeline.
 *
 * Twenty rather than the library's twenty-five: a session row is three lines
 * (when, how long, where in the track), so twenty of them is already a screen
 * and a half of scrolling on a laptop.
 */
export const TRACK_SESSION_PAGE_SIZE = 20;

export type SessionWindow = { from: number; to?: number; limit?: number };

export type TrackSessionPage = {
  sessions: SessionDetail[];
  page: number;
  limit: number;
  /** A short page is the last page — the act returns no total. */
  hasMore: boolean;
};
