/**
 * How much of anything one playlist screen asks for.
 *
 * These live beside the domain types rather than beside an action for a
 * mechanical reason: a `"use server"` module may only export async functions, so
 * a `const` there passes `tsc` and fails `next build`.
 *
 * ## Three different "pages", and why they are not one number
 *
 *   · `PLAYLIST_PAGE_SIZE` is what the list shows — twenty cards is a screenful.
 *   · `PLAYLIST_SCAN_PAGE_SIZE` is how the detail read looks for one playlist:
 *     there is no `getPlaylist(id)` act, so it scans the same list. Fifty is the
 *     act's own default, which makes it the cheapest page it will serve.
 *   · `PLAYLIST_LIBRARY_PAGE_SIZE` is how the library index is built. It is
 *     larger than the table's page because nobody is reading it — it exists to
 *     be turned into a `Map`.
 *
 * The two `MAX` bounds are the honest cost of not having a singular read or a
 * join on the backend. Both are stated, both are checked, and both fail visibly
 * rather than by truncating: a scan that runs out of pages says so.
 */

import type { Playlist } from "./playlist";

/** One page of the playlists list. */
export const PLAYLIST_PAGE_SIZE = 20;

/**
 * The longest title the UI will accept.
 *
 * Enforced in three places that all have to agree: the field's `maxLength`, the
 * action's check before the call, and this number. A title longer than this is
 * not a validation the listener can fix after the fact — it is a paste that has
 * to be trimmed before it reaches the backend.
 */
export const PLAYLIST_TITLE_MAX = 120;

/** One page of the scan that locates a single playlist by id. */
export const PLAYLIST_SCAN_PAGE_SIZE = 50;

/**
 * How many pages that scan will read.
 *
 * A thousand playlists is already outside what this app is for — a listener with
 * more has an organisational problem the web console cannot solve by scanning
 * harder. Reaching the cap is reported as a failure rather than as "not found",
 * because the two are different facts and only one of them is true.
 */
export const PLAYLIST_SCAN_MAX_PAGES = 20;

/** One page of the library index the detail page joins items against. */
export const PLAYLIST_LIBRARY_PAGE_SIZE = 100;

/**
 * How many pages of the library the index will read: five thousand tracks.
 *
 * Past that, items are resolved one by one with `getTrackDetail` for the ids the
 * index did not cover (bounded concurrency, see the action). The index is the
 * fast path; the fallback is what keeps an old playlist correct in a very large
 * library instead of showing a page of «این ترک دیگر در کتابخانه نیست».
 */
export const PLAYLIST_LIBRARY_MAX_PAGES = 50;

export type PlaylistPage = {
  playlists: Playlist[];
  page: number;
  limit: number;
  /** A short page is the last page: the act returns no total. */
  hasMore: boolean;
};
