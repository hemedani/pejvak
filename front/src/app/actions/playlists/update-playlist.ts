"use server";

/**
 * Rename a playlist, or replace its items.
 *
 * ## One verb, because the backend has one
 *
 * `updatePlaylist` `$set`s whatever it is given, and `items` is a whole array.
 * Add, remove and move are therefore not acts — they are three ways for the
 * caller to compute the array that this writes. A patch carries the sequence,
 * and this normalises it; it never sorts, because the caller already decided.
 *
 * ## Only what was asked for
 *
 * `description` and `isPublic` are omitted entirely rather than sent as their
 * current values: `$set` with a stale copy is how a field gets reverted by an
 * update that had nothing to do with it.
 *
 * ## Last write wins
 *
 * The backend has no version to compare against, and this action does not invent
 * one. The client disables its controls while a write is in flight and re-reads
 * on success, which is the whole of the concurrency story (PLAN Phase 3.3).
 */

import { revalidatePath } from "next/cache";

import { callAct } from "@/lib/call-act";
import {
  isPlaylistId,
  parsePlaylist,
  PLAYLIST_GET,
  type Playlist,
  type PlaylistItem,
} from "@/lib/domain/playlist";
import { PLAYLIST_TITLE_MAX } from "@/lib/domain/playlist-query";
import { normalizeItems } from "@/lib/playlists";
import { fail, ok, type ActResult } from "@/lib/result";

export type PlaylistPatch = {
  title?: string;
  /** The complete sequence, in the order it should be stored. */
  items?: readonly PlaylistItem[];
};

export async function updatePlaylist(
  playlistId: string,
  patch: PlaylistPatch,
): Promise<ActResult<Playlist | null>> {
  // A bad id means the page is already a 404; there is nothing to write.
  if (!isPlaylistId(playlistId)) {
    return ok(null);
  }

  const set: {
    playlistId: string;
    title?: string;
    items?: { trackId: string; order: number }[];
  } = { playlistId };

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length === 0) {
      // An emptied title is not a rename, it is a validation failure: the act
      // would store an untitled row that no list could label.
      return fail("validation", "playlist title is required");
    }
    if (title.length > PLAYLIST_TITLE_MAX) {
      return fail("validation", "playlist title is too long");
    }
    set.title = title;
  }

  if (patch.items !== undefined) {
    const seen = new Set<string>();
    const items: PlaylistItem[] = [];

    for (const item of patch.items) {
      // A non-ObjectId would fail the act's validator for the whole write, and a
      // repeat would put the same track in the playlist twice. Both are dropped
      // here so one bad row cannot cost the listener the other twenty.
      if (!isPlaylistId(item.trackId) || seen.has(item.trackId)) {
        continue;
      }
      seen.add(item.trackId);
      items.push({ trackId: item.trackId, order: items.length });
    }

    // The write invariant: contiguous `order` values over the given sequence.
    set.items = normalizeItems(items);
  }

  if (set.title === undefined && set.items === undefined) {
    // Nothing to write. Sending an empty patch would bump `updatedAt` and move
    // the playlist to the top of the list for no change at all.
    return ok(null);
  }

  const result = await callAct("playlist", "updatePlaylist", {
    set,
    get: PLAYLIST_GET,
  });

  if (!result.success) {
    return result;
  }

  const playlist = parsePlaylist(result.body);

  // Both, because a rename changes the card's title and a reorder changes its
  // position — and `revalidatePath` on the list alone would leave the detail
  // page showing the previous write until a hard reload.
  revalidatePath("/playlists");
  revalidatePath(`/playlists/${playlistId}`);

  return ok(playlist);
}
