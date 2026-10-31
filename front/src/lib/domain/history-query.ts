/**
 * How much history one read asks for.
 *
 * These live outside the action because a `"use server"` module may only export
 * async functions — a constant there would pass `tsc` and fail `next build`.
 *
 * ## Two numbers, and why not three
 *
 * `HISTORY_BATCH_ROWS` is the batch: how many rows the loop keeps from each
 * response. `HISTORY_MAX_ROWS` is the ceiling: a single stretch is normally a
 * handful of tracks, and one that needs more than two thousand rows to resolve
 * is a data anomaly, not a page. Without the ceiling a corrupt `stretchId` would
 * make one page read the entire history.
 *
 * There is no third "page size" number. A page is however many rows the whole
 * stretches it emitted needed, which is why the action's cursor is a row count
 * (`after`) rather than a page index.
 */

import type { ListeningStretch } from "@/lib/history";

export const HISTORY_BATCH_ROWS = 100;
export const HISTORY_MAX_ROWS = 2000;

/** One page of history, as the action returns it. */
export type HistoryPage = {
  stretches: ListeningStretch[];
  /** Rows consumed so far; the next page starts here. */
  after: number;
  hasMore: boolean;
};
