/**
 * The collection the current queue belongs to, and where playback is inside it.
 *
 * Read in one place so the full player and the mini-player cannot end up showing
 * different collections — or different positions in the same one — for the same
 * queue.
 */

import { useMemo } from "react";

import { formatContextPosition, type PlaybackContext } from "@/lib/playbackContext";
import { usePlayerStore } from "@/store/playerStore";

export type PlaybackContextView = {
  /** The folder or playlist the queue came from, or null for a bare list. */
  context: PlaybackContext | null;
  /**
   * "4 of 12", or null when there is nothing worth saying: no collection, or a
   * collection of one — "1 of 1" is noise on every single-track folder.
   */
  position: string | null;
};

export function usePlaybackContext(): PlaybackContextView {
  const context = usePlayerStore((state) => state.context);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const queueIndex = usePlayerStore((state) => state.queueIndex);

  return useMemo(() => {
    if (!context || queueLength <= 1) {
      return { context, position: null };
    }
    return { context, position: formatContextPosition(queueIndex, queueLength) };
  }, [context, queueIndex, queueLength]);
}
