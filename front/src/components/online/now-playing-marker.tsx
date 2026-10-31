"use client";

/**
 * The dot beside the row the player is on.
 *
 * One client leaf per row, and a *boolean* selector: of sixty rows only two
 * change value when the track changes (the one that left, the one that arrived),
 * so the list does not re-render every time the playhead moves. Selecting
 * `current` itself would re-render all sixty on every skip.
 *
 * The comparison is the identity triple rather than the `contentHash`, because
 * the hash is a client-side SHA-256 and this leaf runs before it exists: the
 * three ids are what the hash is derived from, so they cannot disagree.
 */

import { usePlayerStore } from "@/stores/player";

export function NowPlayingMarker({
  sourceId,
  externalId,
  collectionKey,
}: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}) {
  const active = usePlayerStore(
    (state) =>
      state.current !== null &&
      state.current.sourceId === sourceId &&
      state.current.externalId === externalId &&
      state.current.collectionKey === collectionKey,
  );

  return (
    // The slot is always there, empty when inactive: a dot that appears and
    // disappears would re-truncate the title of one row as playback moves,
    // which reads as the list twitching.
    <span className="grid size-2 shrink-0 place-items-center">
      {active ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          <span className="sr-only">Playing now</span>
        </>
      ) : null}
    </span>
  );
}
