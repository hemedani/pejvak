/**
 * Editing a playlist's sequence, as pure functions.
 *
 * Ported from `mobile/src/lib/playlists.ts`, minus `contentHash` and the local
 * ids: a web playlist item is a server track `_id`, and a whole playlist is
 * written in one `updatePlaylist` call. Add, remove and move are therefore not
 * three verbs — they are three ways to compute the array that gets sent.
 *
 * ## Every function takes the *ordered* sequence
 *
 * `normalizeItems` renumbers by array position, so these functions answer "what
 * sequence do I send?" and not "what is stored?". Passing `playlist.items`
 * directly would silently re-sort a playlist whose stored array is not in `order`
 * sequence — the exact failure `orderedItems()` exists to prevent on the read
 * side. Callers pass `orderedItems(playlist)`.
 *
 * ## The write invariant
 *
 * The result always carries `order` values of 0..n-1 with no gaps. The read side
 * does not assume contiguity (an old row or a hand-written update may have gaps),
 * but every write this app performs establishes it.
 */

import { isPlayableOnWeb } from "@/lib/domain/track";
import type { PlayableEntry, PlaylistEntry, PlaylistItem } from "@/lib/domain/playlist";

/** Rewrites `order` to 0..n-1 over the given sequence. Never mutates its input. */
export function normalizeItems(items: readonly PlaylistItem[]): PlaylistItem[] {
  return items.map((item, index) => ({ trackId: item.trackId, order: index }));
}

/**
 * Appends ids in the order given, skipping any already present.
 *
 * Duplicates *within* `trackIds` collapse too: a picker selection is a set, but
 * a folder import on the phone is a list, and the same lecture saved under two
 * names would otherwise become two identical rows. The single-track case goes
 * through here as well, so "already there" is decided in one place.
 */
export function appendTracks(
  items: readonly PlaylistItem[],
  trackIds: readonly string[],
): PlaylistItem[] {
  const present = new Set(items.map((item) => item.trackId));
  const additions: PlaylistItem[] = [];

  for (const trackId of trackIds) {
    if (present.has(trackId)) {
      continue;
    }
    present.add(trackId);
    additions.push({ trackId, order: items.length + additions.length });
  }

  // Renumbered even when nothing was added: the caller always has a valid array
  // to send, so "add nothing" is never a write with a stale numbering.
  return normalizeItems([...items, ...additions]);
}

/**
 * Removes one id, then renumbers.
 *
 * Removing an id that is not there is a no-op *copy*, not the same reference:
 * callers send the result, and a shared array would make "nothing changed" look
 * like "nothing to send".
 */
export function removeTrack(
  items: readonly PlaylistItem[],
  trackId: string,
): PlaylistItem[] {
  return normalizeItems(items.filter((item) => item.trackId !== trackId));
}

/**
 * Moves one position, clamped at the edges.
 *
 * Both indices are validated here rather than at the button, so a move computed
 * from a stale index is a no-op instead of a row that vanishes from the list.
 * `from === to` is also a no-op — the caller disables the control, and this is
 * the second line of defence.
 */
export function moveItem(
  items: readonly PlaylistItem[],
  from: number,
  to: number,
): PlaylistItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return normalizeItems(items);
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) {
    return normalizeItems(items);
  }
  next.splice(to, 0, moved);
  return normalizeItems(next);
}

/**
 * The entries this browser can actually stream, in playlist order.
 *
 * Two exclusions, and neither is an error:
 *
 *   · `track: null` — the track left the library. The row still exists and is
 *     still removable; it just has nothing to play.
 *   · `origin: "local"` — the bytes are on the phone (plan §2 C2). A playlist is
 *     a cross-device list, so the row stays; the web player has no URL for it.
 *
 * The queue is built from this, which is why a playlist of three local tracks
 * and five online ones runs as five: a run counts what this device could play,
 * and a queue that can never complete is worse than a shorter one.
 */
export function playableEntries(entries: readonly PlaylistEntry[]): PlayableEntry[] {
  const playable: PlayableEntry[] = [];

  for (const entry of entries) {
    if (entry.track !== null && isPlayableOnWeb(entry.track)) {
      playable.push({ item: entry.item, track: entry.track });
    }
  }

  return playable;
}
