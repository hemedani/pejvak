import { useCallback, useEffect, useState } from "react";

import type { LocalContextPlay } from "@/lib/db/types";
import { ContextService } from "@/services/ContextService";

export type UseContextHistoryResult = {
  runs: LocalContextPlay[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * The collection half of the listening history: closed runs, newest first.
 *
 * Reads SQLite through `ContextService`, so the Collections tab works offline
 * exactly as the sessions list does. Only *closed* runs are returned — a run
 * still open is the one being listened to right now, and showing it as history
 * would put a second, unfinished copy of the current listen in the list.
 */
export function useContextHistory(limit = 200): UseContextHistoryResult {
  const [runs, setRuns] = useState<LocalContextPlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void ContextService.history(limit).then((rows) => {
      if (!cancelled) {
        setRuns(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const refresh = useCallback(async () => {
    setRuns(await ContextService.history(limit));
    setLoading(false);
  }, [limit]);

  return { runs, loading, refresh };
}
