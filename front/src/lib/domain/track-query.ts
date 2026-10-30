/**
 * How much of the library one read asks for.
 *
 * These live here rather than beside the action for a mechanical reason: a
 * `"use server"` module may only export async functions, so a constant exported
 * from an action file fails the build with "Only async functions are allowed to
 * be exported in a 'use server' file". `tsc` does not see that rule — the
 * bundler enforces it — so the shapes and bounds sit beside the domain types and
 * the action imports them.
 *
 * Every bound below answers the same question — "how many rows before the answer
 * stops being worth the wait?" — and each carries the reason for its value. A
 * number without a reason is a number somebody will raise.
 */

import type { TrackSummary } from "./track";

/** One page of the library table. Fits a laptop viewport without a scroll. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * How many rows a folded search loads before it filters.
 *
 * A personal library is hundreds of tracks, not hundreds of thousands, and the
 * fold is done once per load rather than per keystroke. 500 is the point where a
 * single page still renders fast and a search covers what a listener could
 * plausibly own. Past it, search would need a server-side index — which is a
 * backend change, not a client workaround.
 */
export const SEARCH_LIMIT = 500;

/** The sortable columns of `getMyTracks`, as the act's validator names them. */
export type TrackSortField = "createdAt" | "updatedAt" | "title" | "lastPlayedAt";

export type SortOrder = "asc" | "desc";

export type TrackQuery = {
  page?: number;
  limit?: number;
  isAudiobook?: boolean;
  sortBy?: TrackSortField;
  sortOrder?: SortOrder;
};

export type TrackPage = {
  tracks: TrackSummary[];
  page: number;
  limit: number;
  /** A short page is the last page. See `getMyTracks`. */
  hasMore: boolean;
};
