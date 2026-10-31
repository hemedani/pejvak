/**
 * Queue arithmetic, pure except where a caller writes the store.
 *
 * The invariants live here so the controller and the sheet cannot disagree:
 * `queueIndex` always points at the current item, `next` at the end restarts the
 * current track rather than wrapping, and removing the current item moves
 * deliberately instead of leaving the index out of bounds.
 */

import type { PlayerTrack } from "./types";

/** A full page of tracks is already in memory; the queue is not a server list. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  return Math.max(0, Math.min(Math.trunc(index), length - 1));
}

/**
 * `next` advances when there is a next item; at the end it stays put, because
 * mobile restarts the current track rather than wrapping.
 */
export function nextIndex(current: number, length: number): number {
  const safe = clampIndex(current, length);
  if (safe < 0) {
    return -1;
  }
  return safe < length - 1 ? safe + 1 : safe;
}

/** `previous` steps back; at the head it stays put so the caller restarts. */
export function previousIndex(current: number, length: number): number {
  const safe = clampIndex(current, length);
  if (safe < 0) {
    return -1;
  }
  return safe > 0 ? safe - 1 : safe;
}

export type RemoveResult = {
  queue: PlayerTrack[];
  /** The index that should be current afterwards; -1 for an empty queue. */
  index: number;
  removedCurrent: boolean;
};

/**
 * Remove one queue item without ever leaving the index out of bounds.
 *
 * - before the current index: the index decrements, so it points at the same
 *   track;
 * - the current item: move to the next item if one exists, otherwise the
 *   previous, otherwise -1;
 * - after the current index: the index is untouched.
 */
export function removeAt(queue: PlayerTrack[], index: number, current: number): RemoveResult {
  if (index < 0 || index >= queue.length) {
    return { queue, index: clampIndex(current, queue.length), removedCurrent: false };
  }

  const nextQueue = queue.filter((_, position) => position !== index);
  const removedCurrent = index === current;

  if (nextQueue.length === 0) {
    return { queue: nextQueue, index: -1, removedCurrent };
  }

  if (index < current) {
    return { queue: nextQueue, index: current - 1, removedCurrent };
  }

  if (removedCurrent) {
    const nextCurrent = index < nextQueue.length ? index : nextQueue.length - 1;
    return { queue: nextQueue, index: nextCurrent, removedCurrent };
  }

  return { queue: nextQueue, index: current, removedCurrent };
}

export type MoveResult = {
  queue: PlayerTrack[];
  index: number;
};

/**
 * Reorder without changing what is playing.
 *
 * If the current item is the one that moved, the new index follows it. The
 * open run's `trackCount` does not change: it is the collection size when the
 * attempt began.
 */
export function moveItem(queue: PlayerTrack[], from: number, to: number, current: number): MoveResult {
  if (
    from < 0 ||
    from >= queue.length ||
    to < 0 ||
    to >= queue.length ||
    from === to
  ) {
    return { queue, index: clampIndex(current, queue.length) };
  }

  const nextQueue = [...queue];
  const [item] = nextQueue.splice(from, 1);
  if (!item) {
    return { queue, index: clampIndex(current, queue.length) };
  }
  nextQueue.splice(to, 0, item);

  let index = clampIndex(current, nextQueue.length);
  if (from === current) {
    index = to;
  } else if (from < current && to >= current) {
    index = current - 1;
  } else if (from > current && to <= current) {
    index = current + 1;
  }

  return { queue: nextQueue, index };
}

/** A queued item the web cannot play; the row says so, next/previous pass it. */
export function isUnplayableHere(track: PlayerTrack): boolean {
  return track.origin === "local";
}

/** A human identity for a queue row; `contentHash` is the stable key. */
export function queueKey(track: PlayerTrack): string {
  return track.contentHash;
}
