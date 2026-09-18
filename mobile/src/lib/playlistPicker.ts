/**
 * The reasoning behind the "add to playlist" picker.
 *
 * A picker can be asked to add more than one track at a time (a whole folder,
 * a whole album), so a playlist is not simply "contains this track" or not — it
 * can hold *some* of what is being added. That third state is the whole reason
 * this module exists: it decides which badge a row shows and what a tap does.
 *
 * Pure and free of React so the rules can be tested directly, which matters
 * because getting the tri-state wrong is the kind of bug that silently adds
 * duplicates or removes tracks the user never selected.
 */

import type { PlaylistItem } from "@/lib/db/types";

/** How much of the current selection a playlist already holds. */
export type Membership = "all" | "some" | "none";

export type PlaylistMembership = {
  state: Membership;
  /** Distinct selected tracks already in this playlist. */
  count: number;
  /** Distinct selected tracks, after collapsing duplicates. */
  total: number;
};

/**
 * Distinct selected ids.
 *
 * A folder can legitimately contain the same content hash twice — the same
 * lecture saved under two names — and counting it twice would make a playlist
 * that holds it once look like it holds "1 of 2".
 */
export function distinctTrackIds(trackIds: readonly string[]): string[] {
  return [...new Set(trackIds)];
}

export function membershipOf(
  items: readonly PlaylistItem[],
  trackIds: readonly string[],
): PlaylistMembership {
  const selected = distinctTrackIds(trackIds);
  if (selected.length === 0) {
    return { state: "none", count: 0, total: 0 };
  }

  const present = new Set(items.map((item) => item.trackId));
  const count = selected.filter((trackId) => present.has(trackId)).length;

  if (count === 0) {
    return { state: "none", count, total: selected.length };
  }
  return {
    state: count === selected.length ? "all" : "some",
    count,
    total: selected.length,
  };
}

/**
 * What a tap on this row does.
 *
 * A playlist holding everything already is the only case that removes — the row
 * shows a filled checkmark, and a checkmark the user cannot undo reads as a bug.
 * Anything else adds, including the partial case, where adding the remainder is
 * the only thing that makes the row agree with its own "2 of 3" label.
 */
export function actionFor(state: Membership): "add" | "remove" {
  return state === "all" ? "remove" : "add";
}

/** The row's secondary line: what is in the playlist, and how much of it is yours. */
export function describeMembership(membership: PlaylistMembership, itemCount: number): string {
  const tracks = `${itemCount} track${itemCount === 1 ? "" : "s"}`;

  switch (membership.state) {
    case "all":
      return itemCount === membership.total
        ? `All ${membership.total} already here`
        : `All ${membership.total} already here · ${tracks}`;
    case "some":
      return `${membership.count} of ${membership.total} already here · ${tracks}`;
    default:
      return tracks;
  }
}

/** Header line for the sheet: what is about to be added. */
export function describeSelection(trackIds: readonly string[]): string {
  const count = distinctTrackIds(trackIds).length;
  if (count === 0) {
    return "Nothing selected";
  }
  return count === 1 ? "1 track" : `${count} tracks`;
}
