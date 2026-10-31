/**
 * A playlist, as the web app reads it.
 *
 * ## The items are ids, and nothing else
 *
 * `back/models/playlist.ts` stores `items: { trackId, order }[]` — no title, no
 * duration, no `contentHash`. Everything a row draws comes from a second lookup
 * keyed by `trackId`, which is why the detail read builds a library index rather
 * than asking for each track (see `actions/playlists/get-my-playlist.ts`).
 *
 * ## Order is data, not array position
 *
 * The act stores the array verbatim, so `items[0]` is not necessarily the first
 * track: `order` is the sequence and the array position is only a tie-break.
 * Reading `items` directly would show a playlist in whatever order the last
 * writer happened to send — usually right, occasionally silently wrong, and
 * wrong in a way that looks like the reorder button failed.
 *
 * So `parsePlaylist` keeps the array as it arrived and `orderedItems()` is the
 * one reader of sequence. Every mutation writes the ordered sequence back with
 * contiguous `order` values (`lib/playlists.ts`), which is the invariant the
 * next read relies on.
 *
 * ## A missing track is not a missing item
 *
 * An item can name a track that has since left the library, and the item must
 * survive that: it is a removable row, not a silently shorter playlist. The join
 * produces `track: null` and the row says «این ترک دیگر در کتابخانه نیست».
 */

import { asArray, asBoolean, asInt, asRecord, asString, asTimestamp } from "../parse";
import type { TrackSummary } from "./track";

export type PlaylistItem = { trackId: string; order: number };

export type Playlist = {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  /** In stored order; read it through `orderedItems()`. */
  items: PlaylistItem[];
  /**
   * `null` when the backend did not send one. Not `0`: `formatRelativeTime`
   * prints «هرگز» for `null`, and 1970 for zero.
   */
  createdAt: number | null;
  updatedAt: number | null;
};

/** One item joined to the library row it points at. */
export type PlaylistEntry = {
  item: PlaylistItem;
  /** `null` when the id is no longer in this user's library. */
  track: TrackSummary | null;
};

/**
 * An entry this browser can actually stream.
 *
 * A separate type rather than a filter, because the queue builder must not
 * re-check for `null`: `playableEntries` is the only thing that decides, and a
 * `!` at the call site is a promise nobody can keep once the filter changes.
 */
export type PlayableEntry = PlaylistEntry & { track: TrackSummary };

/**
 * The projection for a playlist row.
 *
 * `user` and `clientId` are deliberately absent. The list renders neither, and
 * `clientId` is mobile's offline identity — asking for it on the web would be
 * the first step towards a second source of identity for one row.
 */
export const PLAYLIST_GET = {
  _id: 1,
  title: 1,
  description: 1,
  isPublic: 1,
  items: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/** Mongo's ObjectId as it appears on the wire. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function isPlaylistId(value: string): boolean {
  return OBJECT_ID.test(value);
}

/** `null` for an entry that cannot name a track. */
function parseItem(raw: unknown, index: number): PlaylistItem | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const trackId = asString(record.trackId);
  if (!trackId || !OBJECT_ID.test(trackId)) {
    return null;
  }
  return { trackId, order: asInt(record.order) ?? index };
}

/**
 * The items, without duplicates and without malformed entries.
 *
 * A missing `order` falls back to the array index rather than to 0: every item
 * defaulting to 0 would collapse the sequence into "whatever order the array
 * arrived in", which is the one thing `order` exists to avoid. Duplicates keep
 * the first occurrence — the same track twice in one playlist is a bug in a
 * writer, not a feature a listener asked for.
 */
function parseItems(raw: unknown): PlaylistItem[] {
  const seen = new Set<string>();
  const items: PlaylistItem[] = [];

  asArray(raw).forEach((entry, index) => {
    const item = parseItem(entry, index);
    if (!item || seen.has(item.trackId)) {
      return;
    }
    seen.add(item.trackId);
    items.push(item);
  });

  return items;
}

/** `null` for a row that cannot be identified or named. */
export function parsePlaylist(raw: unknown): Playlist | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const id = asString(record._id);
  const title = asString(record.title)?.trim();
  if (!id || !title) {
    return null;
  }

  // A blank description is `null`, never `""`: an empty string would render an
  // empty line under the title on every card whose description was cleared.
  const description = asString(record.description)?.trim() || null;

  const createdAt = asTimestamp(record.createdAt);
  const updatedAt = asTimestamp(record.updatedAt);

  return {
    id,
    title,
    description,
    isPublic: asBoolean(record.isPublic),
    items: parseItems(record.items),
    // Each falls back to the other, so a row written before one of the columns
    // existed still has a time to print.
    createdAt: createdAt ?? updatedAt,
    updatedAt: updatedAt ?? createdAt,
  };
}

/** Preserves the act's order — `updatedAt` descending. */
export function parsePlaylistList(raw: unknown): Playlist[] {
  return asArray(raw)
    .map(parsePlaylist)
    .filter((playlist): playlist is Playlist => playlist !== null);
}

/**
 * Items in playback order.
 *
 * Sorted on `order` with the array position breaking ties, so a stable sort
 * keeps two equal `order` values in the sequence the writer sent. The input is
 * not mutated: the caller's `playlist.items` is server data.
 */
export function orderedItems(playlist: Playlist): PlaylistItem[] {
  return playlist.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map(({ item }) => item);
}
