/**
 * The online library, read from the device.
 *
 * Two questions the Discover screen asks, both answered from SQLite and neither
 * requiring the network:
 *
 *   · **Continue** — what am I part-way through? Answered from `context_plays`,
 *     which is the same table a folder or a playlist run writes to. Nothing
 *     online-specific had to be invented for it: a run is a run.
 *   · **Favorites** — what did I deliberately keep?
 *
 * Kept in one module because they are two readings of the same small set of
 * rows, and splitting them would mean two hooks racing to refresh the same data
 * on the same focus event.
 */

import { useCallback, useState } from "react";

import { LocalDBService } from "@/services/LocalDBService";
import { OnlineCatalogService } from "@/services/OnlineCatalogService";
import type { LocalContextPlay, LocalOnlineCollection } from "@/lib/db/types";
import { runResumeTargetSec } from "@/lib/playbackContext";

/**
 * One collection the listener is part-way through.
 *
 * The run is authoritative for *where they got to*; the collection row is only
 * used for its name and cover, and may legitimately be missing — a run can
 * outlive a collection the listener removed from their list, and losing the
 * ability to continue something because it was un-favourited would be a bug.
 */
export type ContinueItem = {
  run: LocalContextPlay;
  collection: LocalOnlineCollection | null;
  /** Where resuming should drop the playhead. */
  resumeTargetSec: number;
};

export type UseContinueListeningResult = {
  items: ContinueItem[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * One entry per collection, from its newest run.
 *
 * A collection played twice shows once — the newest attempt is the one the
 * listener is actually in the middle of, and two rows for one course would make
 * the list about runs rather than about what to carry on with.
 */
export function useContinueListening(limit = 20): UseContinueListeningResult {
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [runs, saved] = await Promise.all([
      LocalDBService.getOnlineContextPlays(limit * 3),
      LocalDBService.getOnlineCollections(),
    ]);
    const byKey = new Map(saved.map((collection) => [collection.key, collection]));

    const seen = new Set<string>();
    const next: ContinueItem[] = [];
    for (const run of runs) {
      if (seen.has(run.contextKey)) {
        continue;
      }
      seen.add(run.contextKey);
      next.push({
        run,
        collection: byKey.get(run.contextKey) ?? null,
        resumeTargetSec: runResumeTargetSec(run),
      });
      if (next.length >= limit) {
        break;
      }
    }
    setItems(next);
    setLoading(false);
  }, [limit]);

  return { items, loading, refresh };
}

export type UseFavoriteCollectionsResult = {
  items: LocalOnlineCollection[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export function useFavoriteCollections(): UseFavoriteCollectionsResult {
  const [items, setItems] = useState<LocalOnlineCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setItems(await OnlineCatalogService.getFavoriteCollections());
    setLoading(false);
  }, []);

  const remove = useCallback(
    async (key: string) => {
      await OnlineCatalogService.setFavorite(key, false);
      await refresh();
    },
    [refresh],
  );

  return { items, loading, refresh, remove };
}
