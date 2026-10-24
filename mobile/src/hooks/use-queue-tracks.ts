/**
 * The tracks behind the player's queue.
 *
 * The store holds ids, not rows: the queue can be a folder, a saved playlist or
 * an ad-hoc list, and copying a whole library into state to draw a list would
 * make every queue load pay for it. This reads the rows once per queue — in one
 * query — and keeps them keyed by id so the sheet can stay in the queue's own
 * order even when an id no longer resolves.
 *
 * The result is keyed by the queue array's identity rather than guarded by a
 * "loading" flag: the store hands out a new array only when the queue changes,
 * so a late read for the previous queue is simply not the current one.
 */

import { useEffect, useState } from "react";

import type { LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";

const EMPTY: ReadonlyMap<string, LocalTrack> = new Map();

export type UseQueueTracksResult = {
  /** Keyed by track id. A missing id is simply absent, never a blank row. */
  tracks: ReadonlyMap<string, LocalTrack>;
  loading: boolean;
};

export function useQueueTracks(ids: readonly string[]): UseQueueTracksResult {
  const [loaded, setLoaded] = useState<{
    ids: readonly string[];
    tracks: ReadonlyMap<string, LocalTrack>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      return;
    }
    void LocalDBService.getTracksByIds(ids).then((rows) => {
      if (!cancelled) {
        setLoaded({
          ids,
          tracks: new Map(rows.map((track) => [track.id, track])),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const current = loaded?.ids === ids ? loaded : null;
  return {
    tracks: current?.tracks ?? EMPTY,
    loading: ids.length > 0 && current === null,
  };
}
