import { useCallback, useEffect, useState } from "react";

import type { HistoryItem } from "@/lib/history";
import { LocalDBService } from "@/services/LocalDBService";

export type UseHistoryResult = {
  items: HistoryItem[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Local-first listening history: reads finalized sessions from SQLite so the
 * screen works offline. Server history (getMyListeningHistory) is groundwork
 * for a later multi-device pull, not used here yet.
 */
export function useHistory(limit = 200): UseHistoryResult {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void LocalDBService.getSessionsForHistory(limit).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const refresh = useCallback(async () => {
    setItems(await LocalDBService.getSessionsForHistory(limit));
    setLoading(false);
  }, [limit]);

  return { items, loading, refresh };
}
